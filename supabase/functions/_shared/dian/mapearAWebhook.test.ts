import { describe, expect, it } from 'vitest';
import { mapearAWebhook } from './mapearAWebhook.ts';
import type { DatosFactura } from './factura.ts';

const base: DatosFactura = {
  numeroFactura: 'TEST1001',
  cufe: 'a'.repeat(96),
  fechaEmision: '2026-01-15',
  fechaVencimiento: '2026-02-14',
  emisorNit: '900000001',
  emisorNombre: 'PROVEEDOR DE PRUEBA S.A.S',
  lineExtension: 350000,
  taxExclusive: 340000,
  taxInclusive: 379000,
  payable: 379000,
  iva: { iva19: 19000, iva5: 10000, ivaOtros: 0, hayIva19: true, hayIva5: true },
  retencion: { total: 0, reteFuente: 0, reteIva: 0, reteIca: 0 },
};

describe('mapearAWebhook', () => {
  it('produce el payload que espera webhook-facturas', () => {
    expect(mapearAWebhook(base)).toEqual({
      numero_factura: 'TEST1001',
      emisor_nombre: 'PROVEEDOR DE PRUEBA S.A.S',
      emisor_nit: '900000001',
      factura_cufe: 'a'.repeat(96),
      total_a_pagar: 379000,
      total_sin_iva: 340000,
      factura_iva: 19000,
      factura_iva_porcentaje: 19,
      factura_iva_5: 10000,
      factura_iva_5_porcentaje: 5,
      tiene_retencion: false,
      monto_retencion: 0,
      fecha_emision: '2026-01-15',
      fecha_vencimiento: '2026-02-14',
    });
  });

  it('no incluye user_id ni pdf (los agrega el llamador)', () => {
    const p = mapearAWebhook(base) as unknown as Record<string, unknown>;
    expect(p).not.toHaveProperty('user_id');
    expect(p).not.toHaveProperty('pdf_file');
    expect(p).not.toHaveProperty('pdf_file_path');
  });

  it('sin IVA 19%: porcentaje 0 y monto 0', () => {
    const p = mapearAWebhook({ ...base, iva: { iva19: 0, iva5: 0, ivaOtros: 0, hayIva19: false, hayIva5: false } });
    expect(p.factura_iva).toBe(0);
    expect(p.factura_iva_porcentaje).toBe(0);
    expect(p.factura_iva_5).toBe(0);
  });

  it('omite fecha_vencimiento cuando es null', () => {
    const p = mapearAWebhook({ ...base, fechaVencimiento: null });
    expect(p).not.toHaveProperty('fecha_vencimiento');
  });

  it('retención presente', () => {
    const p = mapearAWebhook({ ...base, retencion: { total: 2500, reteFuente: 2500, reteIva: 0, reteIca: 0 } });
    expect(p.tiene_retencion).toBe(true);
    expect(p.monto_retencion).toBe(2500);
  });
});
