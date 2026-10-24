// Adaptador HTTP hacia webhook-facturas. Contrato real (leído del código):
//   201               -> factura creada
//   200 duplicate:true -> ya existía (chequeo previo al insert)
//   409               -> unique_violation 23505 (carrera entre chequeo e insert)
//   400               -> faltan campos / total inválido (permanente)
//   401/503           -> secreto mal configurado: NO es culpa del correo
//   500               -> fallo de base/storage: reintentable
import type { PayloadEnvio, ResultadoEnvio, WebhookFacturas } from '../procesarLote.ts';

// 4xx que no dicen nada del correo sino de la configuración o de la carga:
// etiquetar "rechazada" por un secreto mal puesto condenaría todo el backlog.
const ESTADOS_TRANSITORIOS = new Set([401, 403, 404, 405, 408, 429]);

async function leerCuerpo(res: Response): Promise<Record<string, unknown>> {
  try {
    const v = await res.json();
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function mapearRespuesta(res: Response): Promise<ResultadoEnvio> {
  const cuerpo = await leerCuerpo(res);
  const detalle = [cuerpo.error, cuerpo.details, cuerpo.missing && JSON.stringify(cuerpo.missing)]
    .filter((x) => typeof x === 'string' && x)
    .join(' | ') || `HTTP ${res.status}`;

  const factura = cuerpo.factura && typeof cuerpo.factura === 'object' ? (cuerpo.factura as Record<string, unknown>) : undefined;
  const conFactura = <T extends 'creado' | 'duplicado'>(tipo: T) => (factura ? { tipo, factura } : { tipo });
  if (res.status === 201) return conFactura('creado');
  if (res.status === 200) return cuerpo.duplicate === true ? conFactura('duplicado') : conFactura('creado');
  if (res.status === 409) return { tipo: 'duplicado' };
  if (res.status >= 400 && res.status < 500 && !ESTADOS_TRANSITORIOS.has(res.status)) {
    return { tipo: 'rechazado', estado: res.status, detalle };
  }
  return { tipo: 'error', detalle: `HTTP ${res.status}: ${detalle}` };
}

export interface OpcionesWebhookHttp {
  supabaseUrl: string;
  secreto: string;
  fetch?: typeof fetch;
}

export function crearWebhookHttp(op: OpcionesWebhookHttp): WebhookFacturas {
  const base = op.supabaseUrl.replace(/\/+$/, '');
  const hacerFetch = op.fetch ?? fetch;

  return {
    async enviar(payload: PayloadEnvio, pdf): Promise<ResultadoEnvio> {
      const form = new FormData();
      for (const [campo, valor] of Object.entries(payload)) {
        if (valor !== undefined && valor !== null) form.append(campo, String(valor));
      }
      if (pdf) {
        form.append('pdf_file', new File([pdf.bytes], pdf.nombre, { type: 'application/pdf' }));
      }
      try {
        const res = await hacerFetch(`${base}/functions/v1/webhook-facturas`, {
          method: 'POST',
          headers: { 'x-webhook-secret': op.secreto },
          body: form,
        });
        return await mapearRespuesta(res);
      } catch (e) {
        return { tipo: 'error', detalle: `red: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
