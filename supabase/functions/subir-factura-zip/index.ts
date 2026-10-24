// Subida manual de una factura electrónica DIAN (.zip) desde la UI. Crea la
// factura igual que el pipeline de correo: datos del XML -> `facturas`, PDF -> storage,
// delegando en webhook-facturas. Requiere un usuario autenticado (cualquier rol).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crearWebhookHttp } from '../ingest-correos/adaptadores/webhookHttp.ts';
import { procesarZipSubido } from './procesarZipSubido.ts';

const LIMITE_BYTES = 10 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ estado: 'error', mensaje: 'Método no permitido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const secreto = Deno.env.get('WEBHOOK_FACTURAS_SECRET') ?? '';
  if (!supabaseUrl || !anonKey || !secreto) {
    console.error('subir-factura-zip: faltan variables de entorno');
    return json({ estado: 'error', mensaje: 'Servicio no configurado' }, 503);
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ estado: 'error', mensaje: 'Autenticación requerida' }, 401);

    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ estado: 'error', mensaje: 'Autenticación requerida' }, 401);

    // Corte barato antes de leer el cuerpo (el Content-Length incluye el multipart).
    const largo = Number(req.headers.get('content-length') ?? 0);
    if (largo > LIMITE_BYTES + 64 * 1024) {
      return json({ estado: 'error', mensaje: 'El archivo supera el límite de 10 MB' }, 413);
    }

    const form = await req.formData().catch(() => null);
    const archivo = form?.get('zip');
    if (!(archivo instanceof File)) {
      return json({ estado: 'error', mensaje: 'Falta el archivo ZIP (campo "zip")' }, 400);
    }
    if (archivo.size > LIMITE_BYTES) {
      return json({ estado: 'error', mensaje: 'El archivo supera el límite de 10 MB' }, 413);
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const resultado = await procesarZipSubido(bytes, {
      webhook: crearWebhookHttp({ supabaseUrl, secreto }),
      ahoraMs: Date.now(),
      userId: user.id,
    });

    // 200 también para rechazado/duplicado: invoke() descarta el cuerpo en no-2xx
    // y la UI necesita el `mensaje` para explicarle al usuario qué pasó.
    return json(resultado, resultado.estado === 'error' ? 502 : 200);
  } catch (e) {
    console.error('subir-factura-zip: fallo inesperado', e);
    return json({ estado: 'error', mensaje: 'Error interno del servidor' }, 500);
  }
});
