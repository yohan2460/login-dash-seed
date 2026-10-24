// Orquestación PURA de la subida manual de un ZIP de factura DIAN. Reusa el
// mismo parser, el mismo armado de payload y el mismo webhook que ingest-correos,
// así la fila en `facturas` y el PDF en storage salen idénticos a los del correo.
import { ErrorParserDian, construirPayloadEnvio, parsearZipFactura } from '../_shared/dian/index.ts';
import type { CodigoErrorDian, MotivoRechazo } from '../_shared/dian/index.ts';
import type { WebhookFacturas } from '../ingest-correos/procesarLote.ts';

export type FacturaCreada = Record<string, unknown>;

export type ResultadoSubida =
  | { estado: 'creado'; mensaje: string; factura?: FacturaCreada }
  | { estado: 'duplicado'; mensaje: string; factura?: FacturaCreada }
  | { estado: 'rechazado'; mensaje: string; motivo: string }
  | { estado: 'error'; mensaje: string };

export interface ContextoSubida {
  webhook: WebhookFacturas;
  /** Reloj en ms epoch (inyectado). */
  ahoraMs: number;
  userId: string;
}

const MENSAJE_MOTIVO: Record<MotivoRechazo | CodigoErrorDian, string> = {
  NOTA_CREDITO: 'El archivo es una nota crédito, no una factura de venta. No se puede cargar.',
  NOTA_DEBITO: 'El archivo es una nota débito, no una factura de venta. No se puede cargar.',
  TIPO_NO_SOPORTADO: 'El tipo de documento del archivo no está soportado. Solo se admiten facturas de venta.',
  DATOS_INCOMPLETOS: 'La factura no trae todos los datos necesarios para registrarla.',
  ZIP_VACIO: 'El archivo ZIP está vacío.',
  ZIP_CORRUPTO: 'El archivo no es un ZIP válido o está dañado.',
  ZIP_SIN_XML: 'El ZIP no contiene el XML de la factura.',
  XML_INVALIDO: 'El XML de la factura no se pudo leer.',
  SIN_FACTURA_EMBEBIDA: 'El XML no contiene una factura, nota crédito o nota débito.',
};

const texto = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const rechazo = (motivo: string, base: string, detalle?: string): ResultadoSubida => ({
  estado: 'rechazado',
  motivo,
  mensaje: detalle ? `${base} (${detalle})` : base,
});

export async function procesarZipSubido(bytes: Uint8Array, ctx: ContextoSubida): Promise<ResultadoSubida> {
  let parseo: ReturnType<typeof parsearZipFactura>;
  try {
    parseo = parsearZipFactura(bytes);
  } catch (e) {
    if (e instanceof ErrorParserDian) return rechazo(e.codigo, MENSAJE_MOTIVO[e.codigo]);
    return { estado: 'error', mensaje: `Error inesperado al leer el ZIP: ${texto(e)}` };
  }

  if (!parseo.ok) return rechazo(parseo.motivo, MENSAJE_MOTIVO[parseo.motivo], parseo.detalle);

  const payload = construirPayloadEnvio(parseo.payload, { userId: ctx.userId, ahoraMs: ctx.ahoraMs });

  let envio;
  try {
    envio = await ctx.webhook.enviar(payload, parseo.pdf);
  } catch (e) {
    return { estado: 'error', mensaje: `No se pudo registrar la factura: ${texto(e)}` };
  }

  const n = payload.numero_factura;
  switch (envio.tipo) {
    case 'creado':
      return { estado: 'creado', mensaje: `Factura ${n} creada correctamente.`, factura: envio.factura };
    case 'duplicado':
      return { estado: 'duplicado', mensaje: `La factura ${n} ya existe en el sistema.`, factura: envio.factura };
    case 'rechazado':
      return rechazo(`WEBHOOK_${envio.estado}`, 'El sistema rechazó la factura', envio.detalle);
    case 'error':
      return { estado: 'error', mensaje: `No se pudo registrar la factura, intenta de nuevo: ${envio.detalle}` };
  }
}
