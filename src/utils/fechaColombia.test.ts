import { describe, it, expect } from 'vitest';
import { hoyColombia } from './fechaColombia';

describe('hoyColombia', () => {
  it('a las 8 p.m. de Colombia (01:00 UTC del día siguiente) devuelve el día de Colombia', () => {
    expect(hoyColombia(new Date('2026-10-21T01:00:00Z'))).toBe('2026-10-20');
  });

  it('justo antes de medianoche en Colombia sigue siendo el mismo día', () => {
    expect(hoyColombia(new Date('2026-10-21T04:59:59Z'))).toBe('2026-10-20');
  });

  it('a medianoche de Colombia (05:00 UTC) ya es el día siguiente', () => {
    expect(hoyColombia(new Date('2026-10-21T05:00:00Z'))).toBe('2026-10-21');
  });

  it('en la mañana coincide con el día UTC', () => {
    expect(hoyColombia(new Date('2026-10-20T14:00:00Z'))).toBe('2026-10-20');
  });

  it('cruza fin de año correctamente', () => {
    expect(hoyColombia(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
  });

  it('sin argumento usa el reloj actual y devuelve formato YYYY-MM-DD', () => {
    expect(hoyColombia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
