import { describe, expect, it } from 'vitest';
import { construirPayloadEnvio, nombreCarpeta } from './payloadEnvio.ts';
import type { PayloadWebhookFacturas } from './mapearAWebhook.ts';

const base = {
  numero_factura: 'FE9021',
  fecha_emision: '2026-10-10',
  fecha_vencimiento: undefined,
} as unknown as PayloadWebhookFacturas;

describe('nombreCarpeta', () => {
  it('usa M/D/YYYY sin ceros en hora de Bogota', () => {
    // 2026-10-10 15:00 UTC = 10:00 Bogota
    expect(nombreCarpeta(Date.UTC(2026, 9, 10, 15, 0, 0), 'FE9021')).toBe('10/10/2026_FE9021');
  });
  it('retrocede un dia cuando en Bogota aun es el dia anterior', () => {
    // 2026-01-02 03:00 UTC = 2026-01-01 22:00 Bogota
    expect(nombreCarpeta(Date.UTC(2026, 0, 2, 3, 0, 0), 'FE1')).toBe('1/1/2026_FE1');
  });
});

describe('construirPayloadEnvio', () => {
  const ahora = Date.UTC(2026, 9, 10, 15, 0, 0);
  it('completa fecha_vencimiento con la emision cuando falta', () => {
    const p = construirPayloadEnvio(base, { userId: 'u1', ahoraMs: ahora });
    expect(p.fecha_vencimiento).toBe('2026-10-10');
    expect(p.user_id).toBe('u1');
    expect(p.nombre_carpeta_factura).toBe('10/10/2026_FE9021');
  });
  it('respeta fecha_vencimiento existente', () => {
    const p = construirPayloadEnvio({ ...base, fecha_vencimiento: '2026-11-01' }, { userId: 'u1', ahoraMs: ahora });
    expect(p.fecha_vencimiento).toBe('2026-11-01');
  });
});
