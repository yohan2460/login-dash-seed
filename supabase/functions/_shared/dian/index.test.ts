import { describe, expect, it } from 'vitest';
import { parsearZipFactura } from './index.ts';
import { ErrorParserDian } from './errores.ts';
import { construirZip, construirZipFactura } from './__fixtures__/constructores.ts';

describe('parsearZipFactura (ZIP -> payload)', () => {
  it('de punta a punta con un ZIP sintético', () => {
    const r = parsearZipFactura(construirZipFactura());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.numero_factura).toBe('TEST1001');
      expect(r.payload.total_a_pagar).toBe(119000);
      expect(r.pdf?.bytes.length).toBeGreaterThan(0);
    }
  });

  it('propaga el rechazo de notas crédito', () => {
    const r = parsearZipFactura(construirZipFactura({ raiz: 'CreditNote', codigoTipo: null }));
    expect(r).toMatchObject({ ok: false, motivo: 'NOTA_CREDITO' });
  });

  it('lanza ErrorParserDian ante un ZIP vacío', () => {
    expect(() => parsearZipFactura(new Uint8Array(0))).toThrow(ErrorParserDian);
    expect(() => parsearZipFactura(construirZip({}))).toThrow(ErrorParserDian);
  });
});
