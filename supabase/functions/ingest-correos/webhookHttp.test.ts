import { describe, expect, it } from 'vitest';
import { crearWebhookHttp, mapearRespuesta } from './adaptadores/webhookHttp.ts';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('mapearRespuesta (contrato real de webhook-facturas)', () => {
  it('201 -> creado', async () => {
    expect(await mapearRespuesta(json({ success: true }, 201))).toEqual({ tipo: 'creado' });
  });
  it('200 con duplicate:true -> duplicado', async () => {
    expect(await mapearRespuesta(json({ success: true, duplicate: true }, 200))).toEqual({ tipo: 'duplicado' });
  });
  it('200 sin duplicate -> creado', async () => {
    expect(await mapearRespuesta(json({ success: true }, 200))).toEqual({ tipo: 'creado' });
  });
  it('409 (23505, carrera) -> duplicado', async () => {
    expect(await mapearRespuesta(json({ error: 'Factura already exists' }, 409))).toEqual({ tipo: 'duplicado' });
  });
  it('400 -> rechazado con el detalle', async () => {
    expect(await mapearRespuesta(json({ error: 'Missing required fields', missing: ['emisor_nit'] }, 400))).toMatchObject({
      tipo: 'rechazado',
      estado: 400,
      detalle: expect.stringContaining('Missing required fields'),
    });
  });
  it.each([401, 403, 404, 405, 408, 429])('%i es configuración/transitorio -> error (no rechaza el correo)', async (s) => {
    expect((await mapearRespuesta(json({ error: 'x' }, s))).tipo).toBe('error');
  });
  it.each([500, 502, 503])('%i -> error', async (s) => {
    expect((await mapearRespuesta(json({ error: 'x' }, s))).tipo).toBe('error');
  });
  it('cuerpo no JSON no rompe', async () => {
    expect(await mapearRespuesta(new Response('<html>', { status: 502 }))).toMatchObject({ tipo: 'error' });
  });
});

describe('crearWebhookHttp', () => {
  const payload = {
    numero_factura: 'TEST1',
    emisor_nombre: 'PROVEEDOR DE PRUEBA',
    emisor_nit: '900000001',
    factura_cufe: 'a',
    total_a_pagar: 119000,
    total_sin_iva: 100000,
    factura_iva: 19000,
    factura_iva_porcentaje: 19,
    factura_iva_5: 0,
    factura_iva_5_porcentaje: 5,
    tiene_retencion: false,
    monto_retencion: 0,
    fecha_emision: '2026-09-30',
    fecha_vencimiento: '2026-09-30',
    user_id: 'u',
    nombre_carpeta_factura: '9/30/2026_TEST1',
  };

  it('POST multipart con secreto, campos como string y pdf_file', async () => {
    let req: { url: string; init: RequestInit } | null = null;
    const fetchFalso = (async (url: string, init: RequestInit) => {
      req = { url, init };
      return json({ success: true }, 201);
    }) as unknown as typeof fetch;
    const w = crearWebhookHttp({ supabaseUrl: 'https://x.supabase.co', secreto: 's3', fetch: fetchFalso });
    const r = await w.enviar(payload, { nombre: 'f.pdf', bytes: new Uint8Array([0x25, 0x50]) });
    expect(r).toEqual({ tipo: 'creado' });
    expect(req!.url).toBe('https://x.supabase.co/functions/v1/webhook-facturas');
    expect(req!.init.method).toBe('POST');
    expect((req!.init.headers as Record<string, string>)['x-webhook-secret']).toBe('s3');
    const fd = req!.init.body as FormData;
    expect(fd.get('numero_factura')).toBe('TEST1');
    expect(fd.get('total_a_pagar')).toBe('119000');
    expect(fd.get('tiene_retencion')).toBe('false');
    expect(fd.get('user_id')).toBe('u');
    const pdf = fd.get('pdf_file') as File;
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBe(2);
  });

  it('sin PDF no agrega pdf_file', async () => {
    let body: FormData | null = null;
    const fetchFalso = (async (_u: string, init: RequestInit) => {
      body = init.body as FormData;
      return json({ success: true }, 201);
    }) as unknown as typeof fetch;
    const w = crearWebhookHttp({ supabaseUrl: 'https://x.supabase.co/', secreto: 's', fetch: fetchFalso });
    await w.enviar(payload, null);
    expect(body!.has('pdf_file')).toBe(false);
  });

  it('error de red -> error transitorio', async () => {
    const fetchFalso = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const w = crearWebhookHttp({ supabaseUrl: 'https://x.supabase.co', secreto: 's', fetch: fetchFalso });
    expect(await w.enviar(payload, null)).toMatchObject({ tipo: 'error', detalle: expect.stringContaining('fetch failed') });
  });
});
