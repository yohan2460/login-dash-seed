import { describe, expect, it } from 'vitest';
import { extraerArchivosZip } from './zip.ts';
import { parsearZipFactura } from './index.ts';
import { ErrorParserDian } from './errores.ts';
import { construirZip, construirZip64, construirZip64Factura } from './__fixtures__/constructores.ts';

const codigoDeError = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof ErrorParserDian ? e.codigo : `NO_TIPADO:${(e as Error).message}`;
  }
  return undefined;
};

describe('extraerArchivosZip', () => {
  it('extrae el XML como texto y el PDF como bytes', () => {
    const zip = construirZip({ 'z0900000001.xml': '<a>ñandú</a>', 'z0900000001.pdf': new Uint8Array([1, 2, 3]) });
    const r = extraerArchivosZip(zip);
    expect(r.xml).toEqual({ nombre: 'z0900000001.xml', contenido: '<a>ñandú</a>' });
    expect(r.pdf?.nombre).toBe('z0900000001.pdf');
    expect(Array.from(r.pdf!.bytes)).toEqual([1, 2, 3]);
  });

  it('el nombre no sigue ningún patrón: extensión en mayúsculas y subcarpetas', () => {
    const zip = construirZip({ 'carpeta/B9439A10.XML': '<a/>', 'carpeta/B9439A10.PDF': new Uint8Array([9]) });
    const r = extraerArchivosZip(zip);
    expect(r.xml.contenido).toBe('<a/>');
    expect(r.pdf).not.toBeNull();
  });

  it('pdf es null si el ZIP no trae PDF', () => {
    expect(extraerArchivosZip(construirZip({ 'a.xml': '<a/>' })).pdf).toBeNull();
  });

  it('descarta el BOM UTF-8 del XML', () => {
    const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('<a/>')]);
    expect(extraerArchivosZip(construirZip({ 'a.xml': conBom })).xml.contenido).toBe('<a/>');
  });

  it('ZIP_VACIO: bytes vacíos (descarga transitoria fallida)', () => {
    expect(codigoDeError(() => extraerArchivosZip(new Uint8Array(0)))).toBe('ZIP_VACIO');
  });

  it('ZIP_VACIO: ZIP válido sin entradas', () => {
    expect(codigoDeError(() => extraerArchivosZip(construirZip({})))).toBe('ZIP_VACIO');
  });

  it('ZIP_CORRUPTO: basura que no es un ZIP', () => {
    expect(codigoDeError(() => extraerArchivosZip(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])))).toBe('ZIP_CORRUPTO');
  });

  it('ZIP_CORRUPTO: ZIP truncado', () => {
    const zip = construirZip({ 'a.xml': '<a>' + 'x'.repeat(500) + '</a>' });
    expect(codigoDeError(() => extraerArchivosZip(zip.slice(0, Math.floor(zip.length / 2))))).toBe('ZIP_CORRUPTO');
  });

  it('ZIP_SIN_XML: trae solo PDF', () => {
    expect(codigoDeError(() => extraerArchivosZip(construirZip({ 'a.pdf': new Uint8Array([1]) })))).toBe('ZIP_SIN_XML');
  });

  describe('ZIP64 (fallback manual)', () => {
    it('deflate con tamaños 0xFFFFFFFF + data descriptor: extrae XML y PDF', () => {
      const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
      const r = extraerArchivosZip(construirZip64({ 'a.xml': '<a>ñandú</a>', 'a.pdf': pdf }));
      expect(r.xml).toEqual({ nombre: 'a.xml', contenido: '<a>ñandú</a>' });
      expect(Array.from(r.pdf!.bytes)).toEqual(Array.from(pdf));
    });

    it('offset del header local también en el extra ZIP64', () => {
      const r = extraerArchivosZip(construirZip64({ 'a.pdf': new Uint8Array([7]), 'a.xml': '<b/>' }, { offset64: true }));
      expect(r.xml.contenido).toBe('<b/>');
      expect(Array.from(r.pdf!.bytes)).toEqual([7]);
    });

    it('entrada almacenada (método 0)', () => {
      const r = extraerArchivosZip(construirZip64({ 'a.xml': '<s/>', 'a.pdf': new Uint8Array([5, 6]) }, { almacenados: ['a.xml'] }));
      expect(r.xml.contenido).toBe('<s/>');
    });

    it('EOCD con comentario al final', () => {
      const r = extraerArchivosZip(construirZip64({ 'a.xml': '<c/>' }, { comentario: 'hola' }));
      expect(r.xml.contenido).toBe('<c/>');
    });

    it('ZIP_CORRUPTO: ZIP64 truncado', () => {
      const zip = construirZip64({ 'a.xml': '<a>' + 'x'.repeat(500) + '</a>' });
      expect(codigoDeError(() => extraerArchivosZip(zip.slice(0, Math.floor(zip.length / 2))))).toBe('ZIP_CORRUPTO');
      expect(codigoDeError(() => extraerArchivosZip(zip.slice(0, zip.length - 30)))).toBe('ZIP_CORRUPTO');
    });

    it('ZIP_CORRUPTO: método de compresión no soportado', () => {
      const zip = construirZip64({ 'a.xml': '<a/>' });
      // El método está en el offset 10 del header central: lo buscamos por su firma.
      const v = new DataView(zip.buffer);
      for (let i = 0; i < zip.length - 4; i++) if (v.getUint32(i, true) === 0x02014b50) v.setUint16(i + 10, 99, true);
      expect(codigoDeError(() => extraerArchivosZip(zip))).toBe('ZIP_CORRUPTO');
    });

    it('parsearZipFactura devuelve ok con un ZIP64', () => {
      const r = parsearZipFactura(construirZip64Factura());
      expect(r.ok).toBe(true);
    });

    it('tamaño declarado absurdo (2^40) con datos reales pequeños: no preasigna', () => {
      const zip = construirZip64({ 'a.xml': '<a>ñ</a>', 'a.pdf': new Uint8Array([1]) }, { tamanoDeclarado: 2n ** 40n });
      const r = extraerArchivosZip(zip);
      expect(r.xml.contenido).toBe('<a>ñ</a>');
    });

    it('ZIP_CORRUPTO: entrada que se infla más allá del tope (zip bomb)', () => {
      const zip = construirZip64({ 'a.xml': new Uint8Array(60 * 1024 * 1024) }, { tamanoDeclarado: 2n ** 50n });
      expect(codigoDeError(() => extraerArchivosZip(zip))).toBe('ZIP_CORRUPTO');
    });
  });
});
