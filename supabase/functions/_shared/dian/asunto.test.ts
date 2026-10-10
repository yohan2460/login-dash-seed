import { describe, expect, it } from 'vitest';
import { parsearAsuntoDian } from './asunto.ts';

describe('parsearAsuntoDian', () => {
  it('parsea un asunto estándar con punto y coma final', () => {
    expect(parsearAsuntoDian('900000001;EMPRESA UNO S.A.S;FF100;01;EMPRESA UNO S.A.S;')).toEqual({
      nit: '900000001',
      razonSocial: 'EMPRESA UNO S.A.S',
      numero: 'FF100',
      tipoDocumento: '01',
    });
  });

  it('tolera espacios variables alrededor de cada campo', () => {
    expect(parsearAsuntoDian('900000002; FERRETERIA DE PRUEBA GH S.A.S; NC702; 91; FERRETERIA DE PRUEBA GH S.A.S')).toEqual({
      nit: '900000002',
      razonSocial: 'FERRETERIA DE PRUEBA GH S.A.S',
      numero: 'NC702',
      tipoDocumento: '91',
    });
    expect(parsearAsuntoDian('900000003;IMPORTS DE PRUEBA S.A.S.   ;IMP425;01;IMPORTS DE PRUEBA S.A.S.')?.razonSocial).toBe(
      'IMPORTS DE PRUEBA S.A.S.',
    );
  });

  it('acepta campos extra después del tipo de documento', () => {
    const r = parsearAsuntoDian('800000004;TELCO S.A.;E611;01;MARCA;MOVIL');
    expect(r?.numero).toBe('E611');
    expect(r?.tipoDocumento).toBe('01');
  });

  it('devuelve null para asuntos que no son de la DIAN', () => {
    expect(parsearAsuntoDian('Alerta de seguridad')).toBeNull();
    expect(parsearAsuntoDian('')).toBeNull();
    expect(parsearAsuntoDian('a;b;c;d')).toBeNull(); // NIT no numérico
    expect(parsearAsuntoDian('900000001;X;FF1;ZZ;')).toBeNull(); // tipo no numérico de 2 dígitos
    expect(parsearAsuntoDian('900000001;X;;01;')).toBeNull(); // sin número
    expect(parsearAsuntoDian('900000001;X;FF1')).toBeNull(); // incompleto
  });
});
