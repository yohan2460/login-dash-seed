// Errores tipados del parser DIAN. Quien consume (ingest-correos) decide por
// `codigo` si reintenta (descarga transitoria) o descarta el correo.
export type CodigoErrorDian =
  | 'ZIP_VACIO' // 0 bytes o ZIP sin entradas: típico de una descarga IMAP fallida; reintentar
  | 'ZIP_CORRUPTO' // bytes que no son un ZIP válido o están truncados
  | 'ZIP_SIN_XML' // el ZIP no trae ningún .xml
  | 'XML_INVALIDO' // el XML no se puede parsear
  | 'SIN_FACTURA_EMBEBIDA'; // el XML no contiene Invoice/CreditNote/DebitNote

export class ErrorParserDian extends Error {
  readonly codigo: CodigoErrorDian;

  constructor(codigo: CodigoErrorDian, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorParserDian';
    this.codigo = codigo;
  }
}
