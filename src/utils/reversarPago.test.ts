import { describe, it, expect } from 'vitest';
import {
  buildReversalPayload,
  validarMotivo,
  resolverComprobanteRaiz,
  resumirSaldosADevolver,
  parseReversarPagoResult,
  MOTIVO_MIN_LENGTH,
  type FacturaReversible,
} from './reversarPago';
import { calcularValorRealAPagar } from './calcularValorReal';

const factura = (over: Partial<FacturaReversible> = {}): FacturaReversible => ({
  id: 'f1',
  total_a_pagar: 1000,
  ...over,
});

describe('buildReversalPayload', () => {
  it('devuelve [] con entrada vacía', () => {
    expect(buildReversalPayload([])).toEqual([]);
  });

  it('solo expone id y valor_real_a_pagar (sin extras)', () => {
    const [p] = buildReversalPayload([factura()]);
    expect(Object.keys(p).sort()).toEqual(['id', 'valor_real_a_pagar']);
    expect(p).toEqual({ id: 'f1', valor_real_a_pagar: 1000 });
  });

  it('respeta descuentos antes de IVA', () => {
    const f = factura({
      total_a_pagar: 1190,
      total_sin_iva: 1000,
      factura_iva: 190,
      descuentos_antes_iva: JSON.stringify([{ tipo: 'porcentaje', valor: 10 }]),
    });
    const [p] = buildReversalPayload([f]);
    expect(p.valor_real_a_pagar).toBe(1090);
  });

  it('respeta retención y notas de crédito igual que calcularValorRealAPagar', () => {
    const f = factura({
      total_a_pagar: 1190,
      total_sin_iva: 1000,
      factura_iva: 190,
      tiene_retencion: true,
      monto_retencion: 2.5,
      notas: JSON.stringify({ notas_credito: [{ valor_descuento: 119, descuento_sin_iva: 100, iva_descuento: 19 }] }),
    });
    const [p] = buildReversalPayload([f]);
    expect(p.valor_real_a_pagar).toBe(calcularValorRealAPagar({ ...f, uso_pronto_pago: false }));
  });

  it('ignora el valor_real_a_pagar almacenado (lossy)', () => {
    const f = { ...factura(), valor_real_a_pagar: 10 } as FacturaReversible;
    const [p] = buildReversalPayload([f]);
    expect(p.valor_real_a_pagar).toBe(1000);
  });

  it('fuerza uso_pronto_pago=false: no aplica descuento de pronto pago', () => {
    const f = factura({ uso_pronto_pago: true, porcentaje_pronto_pago: 5, total_sin_iva: 1000 });
    const [p] = buildReversalPayload([f]);
    expect(p.valor_real_a_pagar).toBe(1000);
  });

  it('no muta la entrada (mantiene porcentaje y flag originales)', () => {
    const f = factura({ uso_pronto_pago: true, porcentaje_pronto_pago: 5 });
    buildReversalPayload([f]);
    expect(f.uso_pronto_pago).toBe(true);
    expect(f.porcentaje_pronto_pago).toBe(5);
  });

  it('nunca devuelve negativos', () => {
    const f = factura({
      total_a_pagar: 100,
      descuentos_antes_iva: JSON.stringify([{ tipo: 'valor', valor: 500 }]),
    });
    expect(buildReversalPayload([f])[0].valor_real_a_pagar).toBe(0);
  });

  it('preserva ids y orden uno a uno', () => {
    const r = buildReversalPayload([
      factura({ id: 'c', total_a_pagar: 3 }),
      factura({ id: 'a', total_a_pagar: 1 }),
      factura({ id: 'b', total_a_pagar: 2 }),
    ]);
    expect(r.map(x => x.id)).toEqual(['c', 'a', 'b']);
    expect(r.map(x => x.valor_real_a_pagar)).toEqual([3, 1, 2]);
  });

  it('redondea a 2 decimales', () => {
    const [p] = buildReversalPayload([factura({ total_a_pagar: 100.456 })]);
    expect(p.valor_real_a_pagar).toBe(100.46);
  });
});

describe('validarMotivo', () => {
  it('rechaza vacío', () => {
    expect(validarMotivo('')).toEqual({ valido: false, motivo: '', error: expect.any(String) });
  });
  it('rechaza solo espacios', () => {
    expect(validarMotivo('     ').valido).toBe(false);
  });
  it('rechaza menos del mínimo tras trim', () => {
    expect(validarMotivo('  abcd  ').valido).toBe(false);
    expect(MOTIVO_MIN_LENGTH).toBe(5);
  });
  it('acepta y devuelve el motivo recortado', () => {
    expect(validarMotivo('  error de pago  ')).toEqual({ valido: true, motivo: 'error de pago' });
  });
  it('tolera null/undefined', () => {
    expect(validarMotivo(undefined).valido).toBe(false);
    expect(validarMotivo(null).valido).toBe(false);
  });
});

describe('resolverComprobanteRaiz', () => {
  it('individual sin detalles: devuelve su propio id', () => {
    expect(resolverComprobanteRaiz({ id: 'c1', detalles: null })).toBe('c1');
  });
  it('grupal: devuelve su propio id', () => {
    expect(resolverComprobanteRaiz({ id: 'g1', detalles: { proveedor: 'x' } })).toBe('g1');
  });
  it('derivado: devuelve el grupal raíz', () => {
    expect(
      resolverComprobanteRaiz({ id: 'd1', detalles: { regenerado_desde_grupal: 'g1' } })
    ).toBe('g1');
  });
  it('ignora regenerado_desde_grupal vacío o no string', () => {
    expect(resolverComprobanteRaiz({ id: 'd1', detalles: { regenerado_desde_grupal: '' } })).toBe('d1');
    expect(resolverComprobanteRaiz({ id: 'd1', detalles: { regenerado_desde_grupal: 5 } })).toBe('d1');
  });
});

describe('resumirSaldosADevolver', () => {
  it('devuelve vacío sin aplicaciones', () => {
    expect(resumirSaldosADevolver([])).toEqual({ saldos: [], total: 0, hayCancelados: false });
  });
  it('suma por saldo y total', () => {
    const r = resumirSaldosADevolver([
      { saldo_favor_id: 's1', monto_aplicado: 100, saldos_favor: { estado: 'agotado' } },
      { saldo_favor_id: 's1', monto_aplicado: 50, saldos_favor: { estado: 'agotado' } },
      { saldo_favor_id: 's2', monto_aplicado: 30.5, saldos_favor: { estado: 'activo' } },
    ]);
    expect(r.saldos).toEqual([
      { saldo_favor_id: 's1', monto: 150, cancelado: false },
      { saldo_favor_id: 's2', monto: 30.5, cancelado: false },
    ]);
    expect(r.total).toBe(180.5);
    expect(r.hayCancelados).toBe(false);
  });
  it('marca cancelados', () => {
    const r = resumirSaldosADevolver([
      { saldo_favor_id: 's1', monto_aplicado: 10, saldos_favor: { estado: 'cancelado' } },
    ]);
    expect(r.saldos[0].cancelado).toBe(true);
    expect(r.hayCancelados).toBe(true);
  });
  it('acepta montos como string numérico y estado ausente', () => {
    const r = resumirSaldosADevolver([{ saldo_favor_id: 's1', monto_aplicado: '10.10' }]);
    expect(r.total).toBe(10.1);
    expect(r.saldos[0].cancelado).toBe(false);
  });
});

describe('parseReversarPagoResult', () => {
  const valido = {
    comprobante_id: '11111111-1111-1111-1111-111111111111',
    facturas_restauradas: 2,
    pagos_partidos_eliminados: 3,
    aplicaciones_revertidas: 1,
    monto_saldo_devuelto: 100,
    derivados_reversados: 0,
    warnings: ['saldo x cancelado'],
  };
  it('parsea una forma válida', () => {
    expect(parseReversarPagoResult(valido)).toEqual(valido);
  });
  it('warnings por defecto es []', () => {
    const { warnings: _w, ...sinWarnings } = valido;
    expect(parseReversarPagoResult(sinWarnings).warnings).toEqual([]);
  });
  it('warnings null se normaliza a []', () => {
    expect(parseReversarPagoResult({ ...valido, warnings: null }).warnings).toEqual([]);
  });
  it('lanza con forma inválida', () => {
    expect(() => parseReversarPagoResult({ foo: 1 })).toThrow();
    expect(() => parseReversarPagoResult(null)).toThrow();
    expect(() => parseReversarPagoResult({ ...valido, facturas_restauradas: 'x' })).toThrow();
  });
});
