import { Inflate, unzipSync } from 'fflate';
import { ErrorParserDian } from './errores.ts';

export interface ArchivosZip {
  xml: { nombre: string; contenido: string };
  pdf: { nombre: string; bytes: Uint8Array } | null;
}

const esXml = (n: string) => /\.xml$/i.test(n);
const esPdf = (n: string) => /\.pdf$/i.test(n);
// Entradas de directorio y basura de macOS que no nos interesan.
const esRuido = (n: string) => n.endsWith('/') || n.startsWith('__MACOSX/');

// Tope de bytes inflados por entrada: defensa contra zip bombs en el fallback.
const MAX_INFLADO = 50 * 1024 * 1024;

const corrupto = (m: string) => new ErrorParserDian('ZIP_CORRUPTO', m);

// Infla sin pista de tamaño (los declarados no son fiables) y corta al pasar el tope.
function inflarAcotado(comprimido: Uint8Array): Uint8Array {
  const trozos: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > MAX_INFLADO) throw corrupto(`Entrada inflada supera ${MAX_INFLADO} bytes`);
    trozos.push(chunk);
  });
  inf.push(comprimido, true);
  const salida = new Uint8Array(total);
  let o = 0;
  for (const t of trozos) {
    salida.set(t, o);
    o += t.length;
  }
  return salida;
}

// Lector manual por DIRECTORIO CENTRAL. Existe porque `unzipSync` preasigna el buffer
// de salida con el tamaño declarado: un ZIP64 con 0xFFFFFFFF (~4GB) revienta en Supabase
// Edge ("Array buffer allocation failed") aunque Node lo tolere. Solo Uint8Array/DataView
// para correr igual en Vitest (Node) y Deno.
function leerZipManual(b: Uint8Array): Record<string, Uint8Array> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u32 = (o: number) => {
    if (o < 0 || o + 4 > b.length) throw corrupto('Lectura fuera de rango');
    return v.getUint32(o, true);
  };
  const u16 = (o: number) => {
    if (o < 0 || o + 2 > b.length) throw corrupto('Lectura fuera de rango');
    return v.getUint16(o, true);
  };
  // Los valores de 64 bits se aceptan solo si caben en un entero seguro y dentro del archivo.
  const u64 = (o: number) => {
    if (o < 0 || o + 8 > b.length) throw corrupto('Lectura fuera de rango');
    const n = v.getBigUint64(o, true);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw corrupto('Valor de 64 bits fuera de rango');
    return Number(n);
  };

  // EOCD: 22 bytes + comentario de hasta 65535; se busca hacia atrás.
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 0xffff; i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw corrupto('No se encontró el fin del directorio central');

  let total = u16(eocd + 10);
  let tamCentral = u32(eocd + 12);
  let offCentral = u32(eocd + 16);
  if (total === 0xffff || tamCentral === 0xffffffff || offCentral === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || u32(loc) !== 0x07064b50) throw corrupto('Falta el localizador ZIP64');
    const z = u64(loc + 8);
    if (u32(z) !== 0x06064b50) throw corrupto('Registro ZIP64 inválido');
    total = u64(z + 32);
    tamCentral = u64(z + 40);
    offCentral = u64(z + 48);
  }
  if (offCentral + tamCentral > b.length) throw corrupto('Directorio central fuera del archivo');

  const salida: Record<string, Uint8Array> = {};
  let p = offCentral;
  for (let n = 0; n < total; n++) {
    if (u32(p) !== 0x02014b50) throw corrupto('Entrada del directorio central inválida');
    const metodo = u16(p + 10);
    let comp = u32(p + 20);
    let sin = u32(p + 24);
    const lenNombre = u16(p + 28);
    const lenExtra = u16(p + 30);
    const lenComentario = u16(p + 32);
    let offLocal = u32(p + 42);
    const iniNombre = p + 46;
    if (iniNombre + lenNombre + lenExtra + lenComentario > b.length) throw corrupto('Entrada truncada');

    // Extra ZIP64: solo trae los campos cuyo valor base era 0xFFFFFFFF, en este orden.
    let e = iniNombre + lenNombre;
    const finExtra = e + lenExtra;
    while (e + 4 <= finExtra) {
      const id = u16(e);
      const len = u16(e + 2);
      if (e + 4 + len > finExtra) throw corrupto('Extra inválido');
      if (id === 0x0001) {
        let q = e + 4;
        const fin = q + len;
        const leer = () => {
          if (q + 8 > fin) throw corrupto('Extra ZIP64 incompleto');
          const x = u64(q);
          q += 8;
          return x;
        };
        if (sin === 0xffffffff) sin = leer();
        if (comp === 0xffffffff) comp = leer();
        if (offLocal === 0xffffffff) offLocal = leer();
      }
      e += 4 + len;
    }
    if (comp === 0xffffffff || offLocal === 0xffffffff) throw corrupto('Tamaño u offset sin resolver');

    const nombre = new TextDecoder('utf-8').decode(b.subarray(iniNombre, iniNombre + lenNombre));
    if (u32(offLocal) !== 0x04034b50) throw corrupto('Header local inválido');
    // Del header local solo nos sirven los largos de nombre+extra para llegar a los datos.
    const datos = offLocal + 30 + u16(offLocal + 26) + u16(offLocal + 28);
    if (datos + comp > b.length) throw corrupto('Datos fuera del archivo');
    const crudo = b.subarray(datos, datos + comp);

    if (metodo === 0) salida[nombre] = crudo.slice();
    else if (metodo === 8) salida[nombre] = inflarAcotado(crudo);
    else throw corrupto(`Método de compresión no soportado: ${metodo}`);
    p = iniNombre + lenNombre + lenExtra + lenComentario;
  }
  return salida;
}

// El nombre y el MIME del adjunto no siguen ningún patrón, así que no confiamos en
// ellos: abrimos el ZIP y buscamos por extensión del contenido.
export function extraerArchivosZip(bytes: Uint8Array): ArchivosZip {
  if (bytes.length === 0) {
    throw new ErrorParserDian('ZIP_VACIO', 'El adjunto llegó con 0 bytes');
  }

  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(bytes);
  } catch (e) {
    try {
      entradas = leerZipManual(bytes);
    } catch (e2) {
      throw corrupto(`No se pudo abrir el ZIP: ${(e as Error).message}; lector manual: ${(e2 as Error).message}`);
    }
  }

  const nombres = Object.keys(entradas).filter((n) => !esRuido(n));
  if (nombres.length === 0) {
    throw new ErrorParserDian('ZIP_VACIO', 'El ZIP no contiene archivos');
  }

  // Si hubiera más de un XML nos quedamos con el más grande: el AttachedDocument
  // trae la factura embebida y pesa más que cualquier otro XML suelto.
  const nombreXml = nombres
    .filter(esXml)
    .sort((a, b) => entradas[b].length - entradas[a].length)[0];
  if (!nombreXml) {
    throw new ErrorParserDian('ZIP_SIN_XML', `El ZIP no trae ningún XML (archivos: ${nombres.join(', ')})`);
  }

  let contenido = new TextDecoder('utf-8').decode(entradas[nombreXml]);
  if (contenido.charCodeAt(0) === 0xfeff) contenido = contenido.slice(1);

  const nombrePdf = nombres.find(esPdf);
  return {
    xml: { nombre: nombreXml, contenido },
    pdf: nombrePdf ? { nombre: nombrePdf, bytes: entradas[nombrePdf] } : null,
  };
}
