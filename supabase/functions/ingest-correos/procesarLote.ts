// Orquestación PURA de la ingesta de facturas desde el buzón. Sin red ni Deno:
// todo lo externo entra por puertos (Buzon, WebhookFacturas) y por un reloj
// inyectado, para poder probar cada rama en Vitest.
import { ErrorParserDian, construirPayloadEnvio, parsearAsuntoDian, parsearZipFactura } from '../_shared/dian/index.ts';
import type { ArchivosZip, PayloadEnvio } from '../_shared/dian/index.ts';

export type { PayloadEnvio };

export type Etiqueta = 'Ferrotodo/procesada' | 'Ferrotodo/rechazada' | 'Ferrotodo/ignorada';

export interface AdjuntoCorreo {
  nombre: string | null;
  parte: string;
}

export interface CorreoCandidato {
  uid: number;
  asunto: string;
  adjuntos: AdjuntoCorreo[];
}

export interface Buzon {
  /** Correos sin etiqueta Ferrotodo/*, del más viejo al más nuevo. */
  buscarPendientes(limite: number): Promise<CorreoCandidato[]>;
  descargarAdjunto(uid: number, parte: string): Promise<Uint8Array>;
  etiquetar(uid: number, etiqueta: Etiqueta): Promise<void>;
}

export type ResultadoEnvio =
  | { tipo: 'creado'; factura?: Record<string, unknown> }
  | { tipo: 'duplicado'; factura?: Record<string, unknown> }
  | { tipo: 'rechazado'; estado: number; detalle: string } // 4xx permanente
  | { tipo: 'error'; detalle: string }; // 5xx / red / config: transitorio

export interface WebhookFacturas {
  enviar(payload: PayloadEnvio, pdf: ArchivosZip['pdf']): Promise<ResultadoEnvio>;
}

export interface ConfigLote {
  userId: string;
  /** Máximo de correos por corrida. Por defecto 8 (plan FREE: 150 s de reloj y 2 s de CPU). */
  limite?: number;
  /** Si el lote lleva más que esto, no arranca otro correo. Por defecto 100 s. */
  presupuestoMs?: number;
  /** Reloj en ms epoch, inyectable. */
  reloj?: () => number;
}

export type Resultado = 'creada' | 'duplicada' | 'ignorada' | 'rechazada' | 'reintentar';

export interface ResumenCorreo {
  uid: number;
  numero: string | null;
  resultado: Resultado;
  motivo?: string;
}

export interface ResumenLote {
  conteo: Record<Resultado, number>;
  correos: ResumenCorreo[];
  cortadoPorTiempo: boolean;
}

const LIMITE_POR_DEFECTO = 8;
const PRESUPUESTO_POR_DEFECTO_MS = 100_000;

// La extensión es lo único estable: los nombres reales son z…, ad…, numéricos o
// UUID, y el MIME varía (application/zip, octet-stream, x-zip-compressed).
const esZip = (nombre: string | null): boolean => !!nombre && /\.zip$/i.test(nombre.trim());

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Errores de descarga: una vez llegó un ZIP vacío de un fetch real y funcionó al
// reintentar, así que estos dos códigos NO condenan al correo.
const esTransitorio = (e: ErrorParserDian): boolean => e.codigo === 'ZIP_VACIO' || e.codigo === 'ZIP_CORRUPTO';

interface Decision {
  resultado: Resultado;
  numero: string | null;
  motivo?: string;
  etiqueta?: Etiqueta;
}

async function decidir(
  correo: CorreoCandidato,
  buzon: Buzon,
  webhook: WebhookFacturas,
  userId: string,
  ahoraMs: number,
): Promise<Decision> {
  const asunto = parsearAsuntoDian(correo.asunto);
  if (!asunto) return { resultado: 'ignorada', numero: null, etiqueta: 'Ferrotodo/ignorada' };

  const numero = asunto.numero;
  if (asunto.tipoDocumento !== '01') {
    return {
      resultado: 'rechazada',
      numero,
      motivo: `tipo de documento ${asunto.tipoDocumento} no soportado`,
      etiqueta: 'Ferrotodo/rechazada',
    };
  }

  const zip = correo.adjuntos.find((a) => esZip(a.nombre));
  if (!zip) return { resultado: 'rechazada', numero, motivo: 'sin adjunto zip', etiqueta: 'Ferrotodo/rechazada' };

  let bytes: Uint8Array;
  try {
    bytes = await buzon.descargarAdjunto(correo.uid, zip.parte);
  } catch (e) {
    return { resultado: 'reintentar', numero, motivo: `descarga fallida: ${mensaje(e)}` };
  }

  let parseo: ReturnType<typeof parsearZipFactura>;
  try {
    parseo = parsearZipFactura(bytes);
  } catch (e) {
    if (e instanceof ErrorParserDian) {
      if (esTransitorio(e)) return { resultado: 'reintentar', numero, motivo: e.codigo };
      return { resultado: 'rechazada', numero, motivo: `${e.codigo}: ${e.message}`, etiqueta: 'Ferrotodo/rechazada' };
    }
    return { resultado: 'reintentar', numero, motivo: `error inesperado al parsear: ${mensaje(e)}` };
  }

  if (!parseo.ok) {
    return { resultado: 'rechazada', numero, motivo: `${parseo.motivo}: ${parseo.detalle}`, etiqueta: 'Ferrotodo/rechazada' };
  }

  const p = parseo.payload;
  const payload = construirPayloadEnvio(p, { userId, ahoraMs });

  let envio: ResultadoEnvio;
  try {
    envio = await webhook.enviar(payload, parseo.pdf);
  } catch (e) {
    return { resultado: 'reintentar', numero: p.numero_factura, motivo: `envío fallido: ${mensaje(e)}` };
  }

  const n = p.numero_factura;
  switch (envio.tipo) {
    case 'creado':
      return { resultado: 'creada', numero: n, etiqueta: 'Ferrotodo/procesada' };
    case 'duplicado':
      return { resultado: 'duplicada', numero: n, etiqueta: 'Ferrotodo/procesada' };
    case 'rechazado':
      return { resultado: 'rechazada', numero: n, motivo: `HTTP ${envio.estado}: ${envio.detalle}`, etiqueta: 'Ferrotodo/rechazada' };
    case 'error':
      return { resultado: 'reintentar', numero: n, motivo: envio.detalle };
  }
}

export async function procesarLote(buzon: Buzon, webhook: WebhookFacturas, config: ConfigLote): Promise<ResumenLote> {
  const limite = config.limite ?? LIMITE_POR_DEFECTO;
  const presupuestoMs = config.presupuestoMs ?? PRESUPUESTO_POR_DEFECTO_MS;
  const reloj = config.reloj ?? Date.now;
  const inicio = reloj();

  const resumen: ResumenLote = {
    conteo: { creada: 0, duplicada: 0, ignorada: 0, rechazada: 0, reintentar: 0 },
    correos: [],
    cortadoPorTiempo: false,
  };

  const candidatos = (await buzon.buscarPendientes(limite)).slice(0, limite);

  for (const correo of candidatos) {
    if (reloj() - inicio > presupuestoMs) {
      resumen.cortadoPorTiempo = true;
      break;
    }

    let d: Decision;
    try {
      d = await decidir(correo, buzon, webhook, config.userId, reloj());
      if (d.etiqueta) await buzon.etiquetar(correo.uid, d.etiqueta);
    } catch (e) {
      // Etiquetar falló (o algo no previsto): sin etiqueta el correo vuelve en la
      // próxima corrida; si el webhook ya lo creó, esa vez responde duplicado.
      d = { resultado: 'reintentar', numero: null, motivo: `fallo inesperado: ${mensaje(e)}` };
    }

    resumen.conteo[d.resultado]++;
    const fila: ResumenCorreo = { uid: correo.uid, numero: d.numero, resultado: d.resultado };
    if (d.motivo) fila.motivo = d.motivo;
    resumen.correos.push(fila);
  }

  return resumen;
}
