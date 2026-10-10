// Ingesta de facturas DIAN desde Gmail (reemplaza al flujo de n8n).
// Se invoca por POST (cron) con el header x-ingest-secret. Procesa un lote
// chico por corrida: el plan FREE da 150 s de reloj y 2 s de CPU por request.
import { ImapFlow } from 'imapflow';
import { crearBuzonImap, type ClienteImap } from './adaptadores/buzonImap.ts';
import { crearWebhookHttp } from './adaptadores/webhookHttp.ts';
import { procesarLote } from './procesarLote.ts';

const LIMITE_MAXIMO = 15;
const DESDE_POR_DEFECTO = '2026/09/28'; // incluye el backlog desde la caída de n8n (2026-09-29)

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Comparación en tiempo constante (hashea primero para no filtrar la longitud).
async function secretsMatch(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

const REQUERIDAS = [
  'INGEST_CORREOS_SECRET',
  'GMAIL_IMAP_USER',
  'GMAIL_IMAP_APP_PASSWORD',
  'WEBHOOK_FACTURAS_SECRET',
  'SUPABASE_URL',
] as const;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Falla cerrado: sin configuración completa no se atiende a nadie.
  const env = Object.fromEntries(REQUERIDAS.map((k) => [k, Deno.env.get(k) ?? ''])) as Record<(typeof REQUERIDAS)[number], string>;
  const faltan = REQUERIDAS.filter((k) => !env[k]);
  if (faltan.length > 0) {
    console.error('ingest-correos: faltan variables de entorno:', faltan.join(', '));
    return json({ error: 'Not configured', faltan }, 503);
  }

  if (!(await secretsMatch(req.headers.get('x-ingest-secret') ?? '', env.INGEST_CORREOS_SECRET))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const cuerpo = (await req.json().catch(() => ({}))) as { limite?: unknown };
  const pedido = Number(cuerpo?.limite);
  const limite = Number.isFinite(pedido) && pedido >= 1 ? Math.min(Math.floor(pedido), LIMITE_MAXIMO) : undefined;

  const cliente = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: env.GMAIL_IMAP_USER, pass: env.GMAIL_IMAP_APP_PASSWORD },
    logger: false,
  });

  const t0 = performance.now();
  let buzon: ReturnType<typeof crearBuzonImap> | null = null;
  try {
    await cliente.connect();
    buzon = crearBuzonImap(cliente as unknown as ClienteImap, {
      desde: Deno.env.get('INGEST_CORREOS_DESDE') || DESDE_POR_DEFECTO,
    });
    const webhook = crearWebhookHttp({ supabaseUrl: env.SUPABASE_URL, secreto: env.WEBHOOK_FACTURAS_SECRET });

    // webhook-facturas ignora el user_id recibido y asigna get_system_user_id(),
    // así que este valor es opcional (solo queda por si el webhook cambia).
    const userId = Deno.env.get('INGEST_CORREOS_USER_ID') ?? '';
    const resumen = await procesarLote(buzon, webhook, { userId, limite });
    const ms = Math.round(performance.now() - t0);
    console.log(
      `ingest-correos: ${JSON.stringify(resumen.conteo)} cortadoPorTiempo=${resumen.cortadoPorTiempo} ms=${ms}` +
        (resumen.correos.length ? ` facturas=${resumen.correos.map((c) => c.numero ?? c.uid).join(',')}` : ''),
    );
    return json({ ok: true, ms, ...resumen }, 200);
  } catch (err) {
    console.error('ingest-correos falló:', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  } finally {
    buzon?.cerrar();
    await cliente.logout().catch(() => {});
  }
});
