// Arma el payload que se envía a webhook-facturas a partir del ZIP ya parseado.
// Lo comparten ingest-correos y subir-factura-zip para que ambas vías generen
// filas idénticas en `facturas`.
import type { PayloadWebhookFacturas } from './mapearAWebhook.ts';

export type PayloadEnvio = PayloadWebhookFacturas & {
  user_id: string;
  fecha_vencimiento: string;
  nombre_carpeta_factura: string;
};

const OFFSET_BOGOTA_MS = -5 * 3600_000;

// Formato legado de n8n: M/D/YYYY sin ceros, con la fecha de PROCESO. Bogotá es
// UTC-5 fijo (sin horario de verano), así que alcanza con desplazar el epoch y
// leer en UTC; no depende de ICU del runtime.
export function nombreCarpeta(ahoraMs: number, numero: string): string {
  const d = new Date(ahoraMs + OFFSET_BOGOTA_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}_${numero}`;
}

export function construirPayloadEnvio(
  p: PayloadWebhookFacturas,
  ctx: { userId: string; ahoraMs: number },
): PayloadEnvio {
  return {
    ...p,
    user_id: ctx.userId,
    // DECISIÓN: una factura de contado no trae vencimiento y vence el día de su
    // emisión. webhook-facturas lo guarda tal cual, así que lo completamos acá.
    fecha_vencimiento: p.fecha_vencimiento ?? p.fecha_emision,
    nombre_carpeta_factura: nombreCarpeta(ctx.ahoraMs, p.numero_factura),
  };
}
