// OPT-IN: corre el parser sobre ZIPs reales de proveedores si existen en esta
// máquina. En CI / otras máquinas se salta. NO hardcodear valores reales acá
// (el repo es público): solo se aseveran propiedades estructurales.
// Uso: DIAN_MUESTRAS_DIR=/ruta/con/zips npx vitest run <este archivo>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extraerArchivosZip } from './zip.ts';
import { parsearAttachedDocument } from './factura.ts';
import { mapearAWebhook } from './mapearAWebhook.ts';

// Sin default a propósito: una ruta local no tiene nada que hacer en un repo público.
const DIR = process.env.DIAN_MUESTRAS_DIR ?? '';

const zips = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.zip')).sort() : [];

describe.skipIf(!existsSync(DIR))('muestras reales (opt-in)', () => {
  it('hay al menos un ZIP', () => {
    expect(zips.length).toBeGreaterThan(0);
  });

  for (const archivo of zips) {
    it(`ZIP ${archivo}: estructura coherente o rechazo limpio`, () => {
      const { xml, pdf } = extraerArchivosZip(new Uint8Array(readFileSync(join(DIR, archivo))));
      expect(pdf).not.toBeNull();
      const r = parsearAttachedDocument(xml.contenido);

      if (!r.ok) {
        // Las notas crédito/débito deben rechazarse con un motivo explícito.
        expect(['NOTA_CREDITO', 'NOTA_DEBITO']).toContain(r.motivo);
        return;
      }
      const f = r.factura;
      expect(f.cufe).toMatch(/^[0-9a-f]{96}$/);
      expect(f.payable).toBeGreaterThan(0);
      expect(f.emisorNit).toMatch(/^\d{6,10}$/);
      expect(f.numeroFactura.length).toBeGreaterThan(0);
      expect(f.fechaEmision).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (f.fechaVencimiento) expect(f.fechaVencimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Consistencia: base + IVA <= total (puede haber INC/otros impuestos que lo suban).
      const ivaTotal = f.iva.iva19 + f.iva.iva5 + f.iva.ivaOtros;
      expect(f.taxExclusive + ivaTotal).toBeLessThanOrEqual(f.payable + 1);
      expect(f.taxInclusive).toBeCloseTo(f.payable, 0);
      expect(f.taxExclusive).toBeGreaterThan(0);

      const p = mapearAWebhook(f);
      expect(p.total_a_pagar).toBe(f.payable);
      expect(p.tiene_retencion).toBe(f.retencion.total > 0);
    });
  }

  it('al menos una muestra es una nota crédito y se rechaza', () => {
    const motivos = zips.map((z) => {
      const { xml } = extraerArchivosZip(new Uint8Array(readFileSync(join(DIR, z))));
      const r = parsearAttachedDocument(xml.contenido);
      return r.ok ? 'OK' : r.motivo;
    });
    expect(motivos).toContain('NOTA_CREDITO');
  });
});
