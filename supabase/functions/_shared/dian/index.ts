import { extraerArchivosZip, type ArchivosZip } from './zip.ts';
import { parsearAttachedDocument, type MotivoRechazo } from './factura.ts';
import { mapearAWebhook, type PayloadWebhookFacturas } from './mapearAWebhook.ts';

export { parsearAsuntoDian, type AsuntoDian } from './asunto.ts';
export { extraerArchivosZip, type ArchivosZip } from './zip.ts';
export { parsearAttachedDocument, type DatosFactura, type ResultadoFactura, type MotivoRechazo } from './factura.ts';
export { mapearAWebhook, type PayloadWebhookFacturas } from './mapearAWebhook.ts';
export { parsearMontoDian } from './monto.ts';
export { ErrorParserDian, type CodigoErrorDian } from './errores.ts';

export type ResultadoZip =
  | { ok: true; payload: PayloadWebhookFacturas; pdf: ArchivosZip['pdf'] }
  | { ok: false; motivo: MotivoRechazo; detalle: string };

/** ZIP del correo -> payload listo para webhook-facturas. Lanza ErrorParserDian ante ZIP/XML rotos. */
export function parsearZipFactura(bytes: Uint8Array): ResultadoZip {
  const { xml, pdf } = extraerArchivosZip(bytes);
  const r = parsearAttachedDocument(xml.contenido);
  if (!r.ok) return r;
  return { ok: true, payload: mapearAWebhook(r.factura), pdf };
}
