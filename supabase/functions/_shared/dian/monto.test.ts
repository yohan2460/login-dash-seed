import { describe, expect, it } from 'vitest';
import { parsearMontoDian } from './monto.ts';

describe('parsearMontoDian', () => {
  it('parsea decimales con punto y redondea a 2 decimales', () => {
    expect(parsearMontoDian('1738571.43')).toBe(1738571.43);
    expect(parsearMontoDian('255119.151564')).toBe(255119.15);
    expect(parsearMontoDian('0.005')).toBe(0.01);
    expect(parsearMontoDian('2068900.00')).toBe(2068900);
  });

  it('acepta enteros, negativos y espacios alrededor', () => {
    expect(parsearMontoDian(' 100 ')).toBe(100);
    expect(parsearMontoDian('-0.0007')).toBe(-0);
    expect(parsearMontoDian('0')).toBe(0);
  });

  it('rechaza basura en vez de adivinar (null)', () => {
    expect(parsearMontoDian('abc')).toBeNull();
    expect(parsearMontoDian('1,5')).toBeNull(); // parseFloat lo leería como 1
    expect(parsearMontoDian('1.234,56')).toBeNull();
    expect(parsearMontoDian('12abc')).toBeNull();
    expect(parsearMontoDian('1e5')).toBeNull();
    expect(parsearMontoDian('Infinity')).toBeNull();
    expect(parsearMontoDian('')).toBeNull();
    expect(parsearMontoDian(undefined)).toBeNull();
    expect(parsearMontoDian(null)).toBeNull();
  });
});
