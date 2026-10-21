import { describe, it, expect } from 'vitest';
import { calcularValorRealConDecision } from './calcularValorReal';

const factura = {
  total_a_pagar: 1801357.74,
  total_sin_iva: 1513746,
  factura_iva: 287611.74,
  tiene_retencion: true,
  monto_retencion: 2.5,
  porcentaje_pronto_pago: 5,
  uso_pronto_pago: false,
};

describe('calcularValorRealConDecision', () => {
  it('aplica el descuento de pronto pago cuando la decisión es true', () => {
    expect(calcularValorRealConDecision(factura, true)).toBe(1687826.79);
  });

  it('no aplica el descuento cuando la decisión es false', () => {
    expect(calcularValorRealConDecision(factura, false)).toBe(1763514.09);
  });

  it('ignora la decisión si la decisión contradice uso_pronto_pago guardado', () => {
    expect(calcularValorRealConDecision({ ...factura, uso_pronto_pago: true }, false)).toBe(1763514.09);
  });

  it('sin porcentaje da lo mismo en ambos sentidos', () => {
    const sin = { ...factura, porcentaje_pronto_pago: null };
    expect(calcularValorRealConDecision(sin, true)).toBe(calcularValorRealConDecision(sin, false));
    expect(calcularValorRealConDecision(sin, true)).toBe(1763514.09);
  });

  it('combina descuentos_antes_iva con pronto pago sobre la base original', () => {
    const conDescuento = {
      ...factura,
      descuentos_antes_iva: JSON.stringify([{ tipo: 'valor', valor: 100000 }]),
    };
    const sinProntoPago = calcularValorRealConDecision(conDescuento, false);
    const conProntoPago = calcularValorRealConDecision(conDescuento, true);
    expect(sinProntoPago).toBeLessThan(1763514.09);
    expect(sinProntoPago - conProntoPago).toBeGreaterThan(0);
  });

  it('no muta la factura recibida', () => {
    calcularValorRealConDecision(factura, true);
    expect(factura.uso_pronto_pago).toBe(false);
  });
});
