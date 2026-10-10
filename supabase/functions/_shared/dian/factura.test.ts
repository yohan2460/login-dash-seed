import { describe, expect, it } from 'vitest';
import { parsearAttachedDocument, type DatosFactura } from './factura.ts';
import { ErrorParserDian } from './errores.ts';
import {
  CUFE_FALSO,
  construirAttachedDocument,
  construirFacturaXml,
  type OpcionesAttached,
  type OpcionesFactura,
} from './__fixtures__/constructores.ts';

const parsear = (f: OpcionesFactura = {}, a: OpcionesAttached = {}) =>
  parsearAttachedDocument(construirAttachedDocument(construirFacturaXml({ ...f, estilo: a.estilo }), a));

const ok = (f: OpcionesFactura = {}, a: OpcionesAttached = {}): DatosFactura => {
  const r = parsear(f, a);
  if (!r.ok) throw new Error(`se esperaba ok, vino ${r.motivo}: ${r.detalle}`);
  return r.factura;
};

describe('parsearAttachedDocument - datos básicos', () => {
  it('extrae número, CUFE, fechas, emisor y totales', () => {
    const f = ok({ dueDate: '2026-02-14' });
    expect(f).toMatchObject({
      numeroFactura: 'TEST1001',
      cufe: CUFE_FALSO,
      fechaEmision: '2026-01-15',
      fechaVencimiento: '2026-02-14',
      emisorNit: '900000001',
      emisorNombre: 'PROVEEDOR DE PRUEBA S.A.S',
      lineExtension: 100000,
      taxExclusive: 100000,
      taxInclusive: 119000,
      payable: 119000,
    });
  });

  it('toma el emisor del AccountingSupplierParty, no del cliente ni del Sender', () => {
    expect(ok().emisorNit).toBe('900000001');
  });

  it('funciona igual con XML de prefijos y con namespace por defecto', () => {
    const a = ok({}, { estilo: 'prefijos' });
    const b = ok({}, { estilo: 'defaultNs' });
    expect(b).toEqual(a);
  });

  it('acepta la factura escapada (&lt;) además de CDATA', () => {
    expect(ok({}, { embebido: 'escapado' })).toEqual(ok({}, { embebido: 'cdata' }));
  });

  it('un número de factura puramente numérico se conserva como string', () => {
    expect(ok({ numero: '0004513100287618' }).numeroFactura).toBe('0004513100287618');
  });

  it('acepta el XML de la factura sin envoltorio AttachedDocument', () => {
    const r = parsearAttachedDocument(construirFacturaXml());
    expect(r.ok && r.factura.numeroFactura).toBe('TEST1001');
  });
});

describe('NIT', () => {
  it('queda solo con dígitos, sin DV (el DV viaja en schemeID)', () => {
    expect(ok({ nit: '900000002' }).emisorNit).toBe('900000002');
  });

  it('si el proveedor mete el DV en el texto ("900000001-7") lo descarta', () => {
    expect(ok({ nit: '900000001-7' }).emisorNit).toBe('900000001');
    expect(ok({ nit: '900.000.001' }).emisorNit).toBe('900000001');
  });
});

describe('fecha de vencimiento', () => {
  it('usa DueDate si existe', () => {
    expect(ok({ dueDate: '2026-03-01', paymentDueDate: '2026-04-01' }).fechaVencimiento).toBe('2026-03-01');
  });
  it('cae a PaymentMeans/PaymentDueDate', () => {
    expect(ok({ paymentDueDate: '2026-04-01' }).fechaVencimiento).toBe('2026-04-01');
  });
  it('es null si no hay ninguna', () => {
    expect(ok().fechaVencimiento).toBeNull();
  });
});

describe('IVA por tarifa', () => {
  it('19% + 5% + exento: cada tarifa con su monto real (no total/1.19)', () => {
    const f = ok({
      ivas: [
        { porcentaje: '19.00', base: '100000.00', monto: '19000.00' },
        { porcentaje: '5.00', base: '200000.00', monto: '10000.00' },
        { porcentaje: '0.00', base: '50000.00', monto: '0.00' },
      ],
      lineExtension: '350000.00',
      taxExclusive: '350000.00',
      taxInclusive: '379000.00',
      payable: '379000.00',
    });
    expect(f.iva).toMatchObject({ iva19: 19000, iva5: 10000, ivaOtros: 0, hayIva19: true, hayIva5: true });
  });

  it('tarifas con formato "19" y "5.0" se reconocen igual', () => {
    const f = ok({
      ivas: [
        { porcentaje: '19', base: '1.00', monto: '0.19' },
        { porcentaje: '5.0', base: '1.00', monto: '0.05' },
      ],
    });
    expect(f.iva.iva19).toBe(0.19);
    expect(f.iva.iva5).toBe(0.05);
  });

  it('una tarifa distinta (ej. 16%) va a ivaOtros', () => {
    const f = ok({ ivas: [{ porcentaje: '16.00', base: '1000.00', monto: '160.00' }] });
    expect(f.iva).toMatchObject({ iva19: 0, iva5: 0, ivaOtros: 160, hayIva19: false });
  });

  it('ignora impuestos que no son IVA (INC, esquema 04)', () => {
    const f = ok({
      ivas: [
        { porcentaje: '19.00', base: '100000.00', monto: '19000.00' },
        { porcentaje: '4.00', base: '2500.00', monto: '100.00', esquema: '04' },
      ],
    });
    expect(f.iva.iva19).toBe(19000);
    expect(f.iva.ivaOtros).toBe(0);
  });

  it('sin ningún TaxTotal: todo en cero, sin romper', () => {
    const f = ok({ ivas: [] });
    expect(f.iva).toMatchObject({ iva19: 0, iva5: 0, ivaOtros: 0, hayIva19: false, hayIva5: false });
  });

  it('redondea montos con más de 2 decimales', () => {
    expect(ok({ ivas: [{ porcentaje: '19.00', base: '1342730.850338', monto: '255119.151564' }] }).iva.iva19).toBe(255119.15);
  });
});

describe('retenciones', () => {
  it('sin WithholdingTaxTotal: no hay retención', () => {
    expect(ok().retencion).toEqual({ total: 0, reteFuente: 0, reteIva: 0, reteIca: 0 });
  });

  it('suma ReteFuente + ReteIVA + ReteICA y las desglosa por esquema', () => {
    const f = ok({
      retenciones: [
        { esquema: '06', nombre: 'ReteFuente', monto: '2500.00' },
        { esquema: '05', nombre: 'ReteIVA', monto: '2850.00' },
        { esquema: '07', nombre: 'ReteICA', monto: '1100.50' },
      ],
    });
    expect(f.retencion).toEqual({ total: 6450.5, reteFuente: 2500, reteIva: 2850, reteIca: 1100.5 });
  });

  it('la retención no altera el total a pagar de la factura', () => {
    expect(ok({ retenciones: [{ esquema: '06', nombre: 'ReteFuente', monto: '2500.00' }] }).payable).toBe(119000);
  });
});

describe('documentos que no son factura de venta', () => {
  it('rechaza una nota crédito (raíz CreditNote)', () => {
    const r = parsear({ raiz: 'CreditNote', codigoTipo: null });
    expect(r).toMatchObject({ ok: false, motivo: 'NOTA_CREDITO' });
  });
  it('rechaza una nota débito (raíz DebitNote)', () => {
    expect(parsear({ raiz: 'DebitNote', codigoTipo: null })).toMatchObject({ ok: false, motivo: 'NOTA_DEBITO' });
  });
  it('rechaza una Invoice cuyo tipo es 91/92 (nota disfrazada)', () => {
    expect(parsear({ codigoTipo: '91' })).toMatchObject({ ok: false, motivo: 'TIPO_NO_SOPORTADO' });
  });
  it('acepta Invoice sin InvoiceTypeCode (asume factura)', () => {
    expect(parsear({ codigoTipo: null }).ok).toBe(true);
  });
});

describe('datos incompletos o inválidos: nunca devuelve parciales', () => {
  it.each([
    ['sin CUFE', { cufe: null }, 'cufe'],
    ['sin fecha de emisión', { fechaEmision: null }, 'fechaEmision'],
    ['fecha de emisión mal formada', { fechaEmision: '15/01/2026' }, 'fechaEmision'],
    ['sin PayableAmount', { payable: null }, 'payable'],
    ['PayableAmount basura', { payable: '1,5' }, 'payable'],
  ] as const)('%s', (_n, opciones, campo) => {
    const r = parsear(opciones as OpcionesFactura);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('DATOS_INCOMPLETOS');
      expect(r.detalle).toContain(campo);
    }
  });

  it('si falta TaxExclusiveAmount usa LineExtensionAmount', () => {
    expect(ok({ taxExclusive: null, lineExtension: '90000.00' }).taxExclusive).toBe(90000);
  });
});

describe('errores tipados', () => {
  const codigo = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof ErrorParserDian ? e.codigo : 'NO_TIPADO';
    }
  };

  it('XML_INVALIDO: texto que no es XML', () => {
    expect(codigo(() => parsearAttachedDocument('esto no es xml <<<'))).toBe('XML_INVALIDO');
    expect(codigo(() => parsearAttachedDocument(''))).toBe('XML_INVALIDO');
  });

  it('SIN_FACTURA_EMBEBIDA: AttachedDocument sin Invoice dentro', () => {
    const xml = '<AttachedDocument><Attachment><ExternalReference><Description>nada</Description></ExternalReference></Attachment></AttachedDocument>';
    expect(codigo(() => parsearAttachedDocument(xml))).toBe('SIN_FACTURA_EMBEBIDA');
  });

  it('SIN_FACTURA_EMBEBIDA: raíz desconocida', () => {
    expect(codigo(() => parsearAttachedDocument('<Otra><a/></Otra>'))).toBe('SIN_FACTURA_EMBEBIDA');
  });
});
