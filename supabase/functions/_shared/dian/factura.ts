import { XMLParser } from 'fast-xml-parser';
import { ErrorParserDian } from './errores.ts';
import { parsearMontoDian } from './monto.ts';

export interface IvaPorTarifa {
  /** IVA al 19%. 0 si no hay. */
  iva19: number;
  /** IVA al 5%. 0 si no hay. */
  iva5: number;
  /** IVA de cualquier otra tarifa (0%, exento, legado 16%...). */
  ivaOtros: number;
  hayIva19: boolean;
  hayIva5: boolean;
}

export interface Retencion {
  total: number;
  reteFuente: number;
  reteIva: number;
  reteIca: number;
}

export interface DatosFactura {
  numeroFactura: string;
  cufe: string;
  fechaEmision: string; // YYYY-MM-DD
  fechaVencimiento: string | null;
  emisorNit: string; // solo dígitos, sin DV
  emisorNombre: string;
  lineExtension: number;
  taxExclusive: number;
  taxInclusive: number;
  payable: number;
  iva: IvaPorTarifa;
  retencion: Retencion;
}

export type MotivoRechazo = 'NOTA_CREDITO' | 'NOTA_DEBITO' | 'TIPO_NO_SOPORTADO' | 'DATOS_INCOMPLETOS';

export type ResultadoFactura =
  | { ok: true; factura: DatosFactura }
  | { ok: false; motivo: MotivoRechazo; detalle: string };

// Tipos de factura de venta: 01 estándar, 02 exportación, 03 contingencia
// del facturador, 04 contingencia DIAN. El resto (91 NC, 92 ND, ...) no.
const TIPOS_FACTURA = new Set(['01', '02', '03', '04']);

// Esquemas de impuesto DIAN (cbc:TaxScheme/cbc:ID).
const ESQUEMA_IVA = '01';
const ESQUEMA_RETE_IVA = '05';
const ESQUEMA_RETE_FUENTE = '06';
const ESQUEMA_RETE_ICA = '07';

// removeNSPrefix: cada proveedor usa prefijos distintos (cbc:/cac:/ns1:/ninguno).
// parseTagValue:false: si no, "0004513" pasa a 4513 y "01" a 1 (perdemos ceros y
// números de factura largos pierden precisión). Todo llega como string.
const crearParser = () =>
  new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });

// deno-lint-ignore no-explicit-any
type Nodo = any;

const lista = (v: Nodo): Nodo[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

// Un elemento con atributos llega como { '#text': 'valor', '@_attr': ... }.
function texto(v: Nodo): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return texto(v[0]);
  if (typeof v === 'object') return texto(v['#text']);
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function parsearXml(xml: string): Nodo {
  if (!xml || !xml.trim()) throw new ErrorParserDian('XML_INVALIDO', 'XML vacío');
  try {
    const parser = crearParser();
    const obj = parser.parse(xml);
    return obj;
  } catch (e) {
    throw new ErrorParserDian('XML_INVALIDO', `XML mal formado: ${(e as Error).message}`);
  }
}

const RAICES_DOCUMENTO = ['Invoice', 'CreditNote', 'DebitNote'] as const;

function raizDocumento(obj: Nodo): { tipo: (typeof RAICES_DOCUMENTO)[number]; nodo: Nodo } | null {
  for (const tipo of RAICES_DOCUMENTO) {
    if (obj?.[tipo] && typeof obj[tipo] === 'object') return { tipo, nodo: obj[tipo] };
  }
  return null;
}

// Localiza el documento tributario: o el XML ya ES un Invoice/NC/ND, o es un
// AttachedDocument que lo trae embebido como string en
// Attachment/ExternalReference/Description (casi siempre CDATA).
function localizarDocumento(xml: string) {
  const obj = parsearXml(xml);
  const directo = raizDocumento(obj);
  if (directo) return directo;

  const adjunto = obj?.AttachedDocument;
  if (!adjunto) {
    throw new ErrorParserDian('SIN_FACTURA_EMBEBIDA', 'El XML no es un AttachedDocument ni un documento tributario');
  }
  for (const ref of lista(adjunto.Attachment)) {
    for (const desc of lista(ref?.ExternalReference?.Description)) {
      const contenido = texto(desc);
      if (!contenido || !contenido.startsWith('<')) continue;
      let interno: Nodo;
      try {
        interno = parsearXml(contenido);
      } catch {
        continue; // probamos con el siguiente Description
      }
      const doc = raizDocumento(interno);
      if (doc) return doc;
    }
  }
  throw new ErrorParserDian('SIN_FACTURA_EMBEBIDA', 'El AttachedDocument no trae una factura embebida');
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function nitSinDv(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Si el proveedor escribió "900000001-7" nos quedamos con lo anterior al guion.
  const sinDv = raw.includes('-') ? raw.split('-')[0] : raw;
  const digitos = sinDv.replace(/\D/g, '');
  return digitos === '' ? undefined : digitos;
}

function datosEmisor(doc: Nodo): { nit?: string; nombre?: string } {
  const party = lista(doc.AccountingSupplierParty)[0]?.Party;
  const candidatos = [...lista(party?.PartyTaxScheme), ...lista(party?.PartyLegalEntity)];
  let nit: string | undefined;
  let nombre: string | undefined;
  for (const c of candidatos) {
    nit ??= nitSinDv(texto(c?.CompanyID));
    nombre ??= texto(c?.RegistrationName);
  }
  return { nit, nombre: nombre?.replace(/\s+/g, ' ') };
}

function fechaVencimiento(doc: Nodo): string | null {
  const due = texto(doc.DueDate);
  if (due && FECHA.test(due)) return due;
  for (const pm of lista(doc.PaymentMeans)) {
    const p = texto(pm?.PaymentDueDate);
    if (p && FECHA.test(p)) return p;
  }
  return null;
}

const suma2 = (a: number, b: number) => Math.round((a + b) * 100) / 100;

function ivaPorTarifa(doc: Nodo): IvaPorTarifa {
  const r: IvaPorTarifa = { iva19: 0, iva5: 0, ivaOtros: 0, hayIva19: false, hayIva5: false };
  for (const tt of lista(doc.TaxTotal)) {
    for (const sub of lista(tt?.TaxSubtotal)) {
      const cat = sub?.TaxCategory;
      if (texto(cat?.TaxScheme?.ID) !== ESQUEMA_IVA) continue; // INC, ICA, etc. no son IVA
      const monto = parsearMontoDian(texto(sub?.TaxAmount)) ?? 0;
      const tarifa = Number(texto(cat?.Percent));
      if (Math.abs(tarifa - 19) < 0.005) {
        r.iva19 = suma2(r.iva19, monto);
        r.hayIva19 = true;
      } else if (Math.abs(tarifa - 5) < 0.005) {
        r.iva5 = suma2(r.iva5, monto);
        r.hayIva5 = true;
      } else {
        r.ivaOtros = suma2(r.ivaOtros, monto);
      }
    }
  }
  return r;
}

function retenciones(doc: Nodo): Retencion {
  const r: Retencion = { total: 0, reteFuente: 0, reteIva: 0, reteIca: 0 };
  for (const wt of lista(doc.WithholdingTaxTotal)) {
    const subs = lista(wt?.TaxSubtotal);
    if (subs.length === 0) {
      // Sin desglose: igual cuenta para el total.
      r.total = suma2(r.total, parsearMontoDian(texto(wt?.TaxAmount)) ?? 0);
      continue;
    }
    for (const sub of subs) {
      const monto = parsearMontoDian(texto(sub?.TaxAmount)) ?? 0;
      r.total = suma2(r.total, monto);
      switch (texto(sub?.TaxCategory?.TaxScheme?.ID)) {
        case ESQUEMA_RETE_FUENTE:
          r.reteFuente = suma2(r.reteFuente, monto);
          break;
        case ESQUEMA_RETE_IVA:
          r.reteIva = suma2(r.reteIva, monto);
          break;
        case ESQUEMA_RETE_ICA:
          r.reteIca = suma2(r.reteIca, monto);
          break;
      }
    }
  }
  return r;
}

export function parsearAttachedDocument(xml: string): ResultadoFactura {
  const { tipo, nodo: doc } = localizarDocumento(xml);

  if (tipo === 'CreditNote') {
    return { ok: false, motivo: 'NOTA_CREDITO', detalle: 'El documento es una nota crédito' };
  }
  if (tipo === 'DebitNote') {
    return { ok: false, motivo: 'NOTA_DEBITO', detalle: 'El documento es una nota débito' };
  }

  const codigoTipo = texto(doc.InvoiceTypeCode);
  if (codigoTipo !== undefined && !TIPOS_FACTURA.has(codigoTipo)) {
    return { ok: false, motivo: 'TIPO_NO_SOPORTADO', detalle: `InvoiceTypeCode ${codigoTipo} no es una factura de venta` };
  }

  const lineExtension = parsearMontoDian(texto(doc.LegalMonetaryTotal?.LineExtensionAmount));
  const taxExclusive = parsearMontoDian(texto(doc.LegalMonetaryTotal?.TaxExclusiveAmount)) ?? lineExtension;
  const payable = parsearMontoDian(texto(doc.LegalMonetaryTotal?.PayableAmount));
  const taxInclusive = parsearMontoDian(texto(doc.LegalMonetaryTotal?.TaxInclusiveAmount)) ?? payable;
  const emisor = datosEmisor(doc);
  const fechaEmision = texto(doc.IssueDate);
  const numeroFactura = texto(doc.ID);
  const cufe = texto(doc.UUID);

  // Nunca devolvemos datos parciales: si falta algo imprescindible, rechazamos.
  const faltantes: string[] = [];
  if (!numeroFactura) faltantes.push('numeroFactura');
  if (!cufe) faltantes.push('cufe');
  if (!fechaEmision || !FECHA.test(fechaEmision)) faltantes.push('fechaEmision');
  if (!emisor.nit) faltantes.push('emisorNit');
  if (!emisor.nombre) faltantes.push('emisorNombre');
  if (payable === null) faltantes.push('payable');
  if (taxExclusive === null) faltantes.push('taxExclusive');
  if (faltantes.length > 0) {
    return { ok: false, motivo: 'DATOS_INCOMPLETOS', detalle: `Faltan o son inválidos: ${faltantes.join(', ')}` };
  }

  return {
    ok: true,
    factura: {
      numeroFactura: numeroFactura!,
      cufe: cufe!,
      fechaEmision: fechaEmision!,
      fechaVencimiento: fechaVencimiento(doc),
      emisorNit: emisor.nit!,
      emisorNombre: emisor.nombre!,
      lineExtension: lineExtension ?? taxExclusive!,
      taxExclusive: taxExclusive!,
      taxInclusive: taxInclusive!,
      payable: payable!,
      iva: ivaPorTarifa(doc),
      retencion: retenciones(doc),
    },
  };
}
