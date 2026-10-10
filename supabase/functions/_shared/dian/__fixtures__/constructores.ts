// Constructores de fixtures SINTÉTICOS (NITs, nombres, CUFE y montos inventados).
// El repo es público: jamás copiar XML reales acá. Solo se imita la ESTRUCTURA
// observada en facturas reales: AttachedDocument + Invoice embebida en CDATA.
import { zipSync, strToU8, deflateSync } from 'fflate';

export type Estilo = 'prefijos' | 'defaultNs';

export interface IvaFixture {
  porcentaje: string; // como lo escribe la DIAN: "19.00"
  base: string;
  monto: string;
  esquema?: string; // por defecto '01' (IVA); '04' = INC
}

export interface RetencionFixture {
  esquema: string; // '05' ReteIVA, '06' ReteFuente, '07' ReteICA
  nombre: string;
  monto: string;
}

export interface OpcionesFactura {
  raiz?: 'Invoice' | 'CreditNote' | 'DebitNote';
  codigoTipo?: string | null; // null = omitir el elemento
  numero?: string;
  cufe?: string | null;
  fechaEmision?: string | null;
  dueDate?: string | null;
  paymentDueDate?: string | null;
  nit?: string;
  nombre?: string;
  lineExtension?: string;
  taxExclusive?: string | null;
  taxInclusive?: string;
  payable?: string | null;
  ivas?: IvaFixture[];
  retenciones?: RetencionFixture[];
  estilo?: Estilo;
}

export const CUFE_FALSO = 'a'.repeat(96);

const nombreTipo = (raiz: string): string =>
  raiz === 'Invoice' ? 'InvoiceTypeCode' : `${raiz}TypeCode`;

export function construirFacturaXml(op: OpcionesFactura = {}): string {
  const estilo = op.estilo ?? 'prefijos';
  const cbc = (n: string) => (estilo === 'prefijos' ? `cbc:${n}` : n);
  const cac = (n: string) => (estilo === 'prefijos' ? `cac:${n}` : n);
  const el = (ns: 'cbc' | 'cac', n: string, v: string, attrs = '') =>
    `<${ns === 'cbc' ? cbc(n) : cac(n)}${attrs}>${v}</${ns === 'cbc' ? cbc(n) : cac(n)}>`;

  const raiz = op.raiz ?? 'Invoice';
  const ivas = op.ivas ?? [{ porcentaje: '19.00', base: '100000.00', monto: '19000.00' }];
  const monto = (n: string, v: string) => el('cbc', n, v, ' currencyID="COP"');

  const subtotales = (lista: { porcentaje: string; base: string; monto: string; esquema: string; nombre: string }[]) =>
    lista
      .map((s) =>
        el(
          'cac',
          'TaxSubtotal',
          monto('TaxableAmount', s.base) +
            monto('TaxAmount', s.monto) +
            el(
              'cac',
              'TaxCategory',
              el('cbc', 'Percent', s.porcentaje) +
                el('cac', 'TaxScheme', el('cbc', 'ID', s.esquema) + el('cbc', 'Name', s.nombre)),
            ),
        ),
      )
      .join('');

  const totalImpuestos = ivas.reduce((a, i) => a + Number(i.monto), 0).toFixed(2);
  const bloqueIva = ivas.length
    ? el(
        'cac',
        'TaxTotal',
        monto('TaxAmount', totalImpuestos) +
          subtotales(ivas.map((i) => ({ ...i, esquema: i.esquema ?? '01', nombre: i.esquema === '04' ? 'INC' : 'IVA' }))),
      )
    : '';

  const retenciones = op.retenciones ?? [];
  const bloqueRet = retenciones.length
    ? el(
        'cac',
        'WithholdingTaxTotal',
        monto('TaxAmount', retenciones.reduce((a, r) => a + Number(r.monto), 0).toFixed(2)) +
          subtotales(
            retenciones.map((r) => ({
              porcentaje: '2.50',
              base: '100000.00',
              monto: r.monto,
              esquema: r.esquema,
              nombre: r.nombre,
            })),
          ),
      )
    : '';

  const payable = op.payable === undefined ? '119000.00' : op.payable;
  const taxExclusive = op.taxExclusive === undefined ? '100000.00' : op.taxExclusive;
  const total =
    el(
      'cac',
      'LegalMonetaryTotal',
      monto('LineExtensionAmount', op.lineExtension ?? '100000.00') +
        (taxExclusive === null ? '' : monto('TaxExclusiveAmount', taxExclusive)) +
        monto('TaxInclusiveAmount', op.taxInclusive ?? '119000.00') +
        (payable === null ? '' : monto('PayableAmount', payable)),
    );

  const nit = op.nit ?? '900000001';
  const proveedor = el(
    'cac',
    'AccountingSupplierParty',
    el(
      'cac',
      'Party',
      el(
        'cac',
        'PartyTaxScheme',
        el('cbc', 'RegistrationName', op.nombre ?? 'PROVEEDOR DE PRUEBA S.A.S') +
          el('cbc', 'CompanyID', nit, ' schemeID="3" schemeName="31"') +
          el('cac', 'TaxScheme', el('cbc', 'ID', '01') + el('cbc', 'Name', 'IVA')),
      ),
    ),
  );

  // Un "cliente" con su propio CompanyID: el parser NO debe confundirlo con el emisor.
  const cliente = el(
    'cac',
    'AccountingCustomerParty',
    el(
      'cac',
      'Party',
      el(
        'cac',
        'PartyTaxScheme',
        el('cbc', 'RegistrationName', 'CLIENTE DE PRUEBA') + el('cbc', 'CompanyID', '900000002', ' schemeID="1"'),
      ),
    ),
  );

  const medioPago = op.paymentDueDate
    ? el('cac', 'PaymentMeans', el('cbc', 'ID', '2') + el('cbc', 'PaymentDueDate', op.paymentDueDate))
    : el('cac', 'PaymentMeans', el('cbc', 'ID', '1'));

  const fecha = op.fechaEmision === undefined ? '2026-01-15' : op.fechaEmision;
  const cufe = op.cufe === undefined ? CUFE_FALSO : op.cufe;

  const ns =
    estilo === 'prefijos'
      ? 'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"'
      : 'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"';

  const codigo = op.codigoTipo === undefined ? '01' : op.codigoTipo;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?><${raiz} ${ns}>` +
    el('cbc', 'ID', op.numero ?? 'TEST1001') +
    (cufe === null ? '' : el('cbc', 'UUID', cufe, ' schemeName="CUFE-SHA384"')) +
    (fecha === null ? '' : el('cbc', 'IssueDate', fecha)) +
    (op.dueDate ? el('cbc', 'DueDate', op.dueDate) : '') +
    (codigo === null ? '' : el('cbc', nombreTipo(raiz), codigo)) +
    proveedor +
    cliente +
    medioPago +
    bloqueIva +
    bloqueRet +
    total +
    `</${raiz}>`
  );
}

export interface OpcionesAttached {
  estilo?: Estilo;
  /** 'cdata' = como los proveedores reales; 'escapado' = con &lt; &gt; */
  embebido?: 'cdata' | 'escapado';
}

export function construirAttachedDocument(invoiceXml: string, op: OpcionesAttached = {}): string {
  const estilo = op.estilo ?? 'prefijos';
  const cbc = (n: string) => (estilo === 'prefijos' ? `cbc:${n}` : n);
  const cac = (n: string) => (estilo === 'prefijos' ? `cac:${n}` : n);
  const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const contenido = op.embebido === 'escapado' ? escapar(invoiceXml) : `<![CDATA[${invoiceXml}]]>`;

  const ns =
    estilo === 'prefijos'
      ? 'xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"'
      : 'xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"';

  // El AttachedDocument real trae más Description y un CompanyID del emisor/receptor
  // en SenderParty: son ruido que el parser tiene que ignorar.
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?><AttachedDocument ${ns}>` +
    `<${cbc('ID')}>900</${cbc('ID')}>` +
    `<${cbc('Note')}>Documento de prueba</${cbc('Note')}>` +
    `<${cac('SenderParty')}><${cac('PartyTaxScheme')}><${cbc('CompanyID')}>999999999</${cbc('CompanyID')}></${cac('PartyTaxScheme')}></${cac('SenderParty')}>` +
    `<${cac('Attachment')}><${cac('ExternalReference')}>` +
    `<${cbc('MimeCode')}>text/xml</${cbc('MimeCode')}>` +
    `<${cbc('Description')}>${contenido}</${cbc('Description')}>` +
    `</${cac('ExternalReference')}></${cac('Attachment')}>` +
    `<${cac('ParentDocumentLineReference')}><${cbc('LineID')}>1</${cbc('LineID')}>` +
    `<${cac('DocumentReference')}><${cac('Attachment')}><${cac('ExternalReference')}>` +
    `<${cbc('Description')}><![CDATA[<?xml version="1.0"?><ApplicationResponse><Note>Documento validado por la DIAN</Note></ApplicationResponse>]]></${cbc('Description')}>` +
    `</${cac('ExternalReference')}></${cac('Attachment')}></${cac('DocumentReference')}></${cac('ParentDocumentLineReference')}>` +
    `</AttachedDocument>`
  );
}

export function construirZip(archivos: Record<string, string | Uint8Array>): Uint8Array {
  const entradas: Record<string, Uint8Array> = {};
  for (const [nombre, contenido] of Object.entries(archivos)) {
    entradas[nombre] = typeof contenido === 'string' ? strToU8(contenido) : contenido;
  }
  return zipSync(entradas);
}

/** ZIP completo como llega por correo: AttachedDocument + PDF. */
export function construirZipFactura(op: OpcionesFactura & OpcionesAttached = {}): Uint8Array {
  const attached = construirAttachedDocument(construirFacturaXml(op), op);
  return construirZip({
    'ad0900000001000000001.xml': attached,
    'fv0900000001000000001.pdf': new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), // "%PDF-1"
  });
}

const crc32 = (datos: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of datos) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
};

export interface OpcionesZip64 {
  /** Nombres que se guardan sin comprimir (método 0). El resto va con deflate (método 8). */
  almacenados?: string[];
  /** Si true, el offset del header local también va en el extra ZIP64 (si no, en 32 bits). */
  offset64?: boolean;
  /** Comentario del ZIP: obliga a buscar el EOCD hacia atrás. */
  comentario?: string;
  /** Tamaño sin comprimir DECLARADO en el extra ZIP64 del central (miente a propósito, como el caso real que lo motivó). */
  tamanoDeclarado?: bigint;
}

/**
 * ZIP64 escrito a mano imitando a un proveedor real: header local con tamaños
 * 0xFFFFFFFF + flag 0x0008 (data descriptor), y directorio central con extra 0x0001.
 * Los tamaños reales SOLO están en el central y en el descriptor.
 */
export function construirZip64(
  archivos: Record<string, string | Uint8Array>,
  op: OpcionesZip64 = {},
): Uint8Array {
  const partes: Uint8Array[] = [];
  let pos = 0;
  const empujar = (u: Uint8Array) => {
    partes.push(u);
    pos += u.length;
  };
  const buf = (n: number) => {
    const u = new Uint8Array(n);
    return { u, v: new DataView(u.buffer) };
  };
  const centrales: Array<{ nombre: Uint8Array; metodo: number; crc: number; comp: number; sin: number; offset: number }> = [];

  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = typeof contenido === 'string' ? strToU8(contenido) : contenido;
    const metodo = op.almacenados?.includes(nombre) ? 0 : 8;
    const comprimido = metodo === 8 ? deflateSync(datos) : datos;
    const crc = crc32(datos);
    const n = strToU8(nombre);
    const offset = pos;

    const l = buf(30 + n.length + 20);
    l.v.setUint32(0, 0x04034b50, true);
    l.v.setUint16(4, 45, true);
    l.v.setUint16(6, 0x0008, true);
    l.v.setUint16(8, metodo, true);
    l.v.setUint32(14, crc, true);
    l.v.setUint32(18, 0xffffffff, true);
    l.v.setUint32(22, 0xffffffff, true);
    l.v.setUint16(26, n.length, true);
    l.v.setUint16(28, 20, true);
    l.u.set(n, 30);
    l.v.setUint16(30 + n.length, 0x0001, true);
    l.v.setUint16(32 + n.length, 16, true);
    empujar(l.u);
    empujar(comprimido);

    const d = buf(24);
    d.v.setUint32(0, 0x08074b50, true);
    d.v.setUint32(4, crc, true);
    d.v.setBigUint64(8, BigInt(comprimido.length), true);
    d.v.setBigUint64(16, BigInt(datos.length), true);
    empujar(d.u);

    centrales.push({ nombre: n, metodo, crc, comp: comprimido.length, sin: datos.length, offset });
  }

  const inicioCentral = pos;
  for (const c of centrales) {
    const extraLen = op.offset64 ? 28 : 20;
    const e = buf(46 + c.nombre.length + extraLen);
    e.v.setUint32(0, 0x02014b50, true);
    e.v.setUint16(4, 0x0033, true);
    e.v.setUint16(6, 45, true);
    e.v.setUint16(8, 0x0008, true);
    e.v.setUint16(10, c.metodo, true);
    e.v.setUint32(16, c.crc, true);
    e.v.setUint32(20, 0xffffffff, true);
    e.v.setUint32(24, 0xffffffff, true);
    e.v.setUint16(28, c.nombre.length, true);
    e.v.setUint16(30, extraLen, true);
    e.v.setUint32(42, op.offset64 ? 0xffffffff : c.offset, true);
    e.u.set(c.nombre, 46);
    const x = 46 + c.nombre.length;
    e.v.setUint16(x, 0x0001, true);
    e.v.setUint16(x + 2, extraLen - 4, true);
    e.v.setBigUint64(x + 4, op.tamanoDeclarado ?? BigInt(c.sin), true);
    e.v.setBigUint64(x + 12, BigInt(c.comp), true);
    if (op.offset64) e.v.setBigUint64(x + 20, BigInt(c.offset), true);
    empujar(e.u);
  }
  const tamCentral = pos - inicioCentral;

  const inicioZ64 = pos;
  const z = buf(56);
  z.v.setUint32(0, 0x06064b50, true);
  z.v.setBigUint64(4, 44n, true);
  z.v.setUint16(12, 0x0033, true);
  z.v.setUint16(14, 45, true);
  z.v.setBigUint64(24, BigInt(centrales.length), true);
  z.v.setBigUint64(32, BigInt(centrales.length), true);
  z.v.setBigUint64(40, BigInt(tamCentral), true);
  z.v.setBigUint64(48, BigInt(inicioCentral), true);
  empujar(z.u);

  const loc = buf(20);
  loc.v.setUint32(0, 0x07064b50, true);
  loc.v.setBigUint64(8, BigInt(inicioZ64), true);
  loc.v.setUint32(16, 1, true);
  empujar(loc.u);

  const com = strToU8(op.comentario ?? '');
  const f = buf(22 + com.length);
  f.v.setUint32(0, 0x06054b50, true);
  f.v.setUint16(8, 0xffff, true);
  f.v.setUint16(10, 0xffff, true);
  f.v.setUint32(12, 0xffffffff, true);
  f.v.setUint32(16, 0xffffffff, true);
  f.v.setUint16(20, com.length, true);
  f.u.set(com, 22);
  empujar(f.u);

  const salida = new Uint8Array(pos);
  let o = 0;
  for (const p of partes) {
    salida.set(p, o);
    o += p.length;
  }
  return salida;
}

/** Igual que construirZipFactura pero en formato ZIP64 (caso real de un proveedor). */
export function construirZip64Factura(op: OpcionesFactura & OpcionesAttached & OpcionesZip64 = {}): Uint8Array {
  const attached = construirAttachedDocument(construirFacturaXml(op), op);
  return construirZip64(
    {
      'ad0900000001000000001.xml': attached,
      'fv0900000001000000001.pdf': new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
    },
    op,
  );
}
