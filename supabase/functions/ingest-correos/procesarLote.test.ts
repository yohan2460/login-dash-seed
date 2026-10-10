import { describe, expect, it } from 'vitest';
import {
  procesarLote,
  type Buzon,
  type ConfigLote,
  type CorreoCandidato,
  type ResultadoEnvio,
  type WebhookFacturas,
} from './procesarLote.ts';
import { construirZip, construirZipFactura } from '../_shared/dian/__fixtures__/constructores.ts';

// Todo sintético: NITs, números y user_id inventados.
const USER_ID = '00000000-0000-0000-0000-000000000000';
const ASUNTO_FV = '900000001;PROVEEDOR DE PRUEBA SAS;FE9021;01;PROVEEDOR DE PRUEBA SAS;';

const correo = (uid: number, over: Partial<CorreoCandidato> = {}): CorreoCandidato => ({
  uid,
  asunto: ASUNTO_FV,
  adjuntos: [{ nombre: 'z0900000001.zip', parte: '2' }],
  ...over,
});

interface Fake {
  buzon: Buzon;
  webhook: WebhookFacturas;
  etiquetas: Map<number, string>;
  descargas: number[];
  envios: { payload: Record<string, unknown>; pdf: unknown }[];
}

function armar(opts: {
  correos: CorreoCandidato[];
  zips?: Record<number, Uint8Array | Error>;
  envio?: (uid: number) => ResultadoEnvio | Error;
}): Fake {
  const etiquetas = new Map<number, string>();
  const descargas: number[] = [];
  const envios: Fake['envios'] = [];
  let actual = 0;
  const buzon: Buzon = {
    buscarPendientes: async (limite) => opts.correos.slice(0, limite),
    descargarAdjunto: async (uid) => {
      descargas.push(uid);
      const z = opts.zips?.[uid] ?? construirZipFactura();
      if (z instanceof Error) throw z;
      return z;
    },
    etiquetar: async (uid, etiqueta) => {
      etiquetas.set(uid, etiqueta);
    },
  };
  const webhook: WebhookFacturas = {
    enviar: async (payload, pdf) => {
      envios.push({ payload: payload as unknown as Record<string, unknown>, pdf });
      const uid = opts.correos[actual++]?.uid ?? 0;
      const r = opts.envio ? opts.envio(uid) : ({ tipo: 'creado' } as ResultadoEnvio);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { buzon, webhook, etiquetas, descargas, envios };
}

const config = (over: Partial<ConfigLote> = {}): ConfigLote => ({
  userId: USER_ID,
  limite: 8,
  presupuestoMs: 100_000,
  reloj: () => Date.UTC(2026, 9, 10, 15, 0, 0),
  ...over,
});

describe('procesarLote: clasificación por asunto', () => {
  it('(a) asunto no DIAN -> ignorada, sin descargar', async () => {
    const f = armar({ correos: [correo(1, { asunto: 'Hola, mira esto' })] });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/ignorada');
    expect(f.descargas).toEqual([]);
    expect(r.conteo.ignorada).toBe(1);
  });

  it('(b) tipo != 01 (nota crédito 91) -> rechazada sin descargar', async () => {
    const f = armar({ correos: [correo(1, { asunto: '900000001;PROVEEDOR;NC55;91;X;' })] });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/rechazada');
    expect(f.descargas).toEqual([]);
    expect(r.correos[0]).toMatchObject({ uid: 1, numero: 'NC55', resultado: 'rechazada' });
  });
});

describe('procesarLote: búsqueda del adjunto ZIP', () => {
  it.each(['z0900000001.zip', 'AD0900000001.ZIP', '123456789.Zip', '0f8fad5b-d9cb-469f-a165-70867728950e.zip'])(
    '(c) encuentra el ZIP por extensión: %s',
    async (nombre) => {
      const f = armar({
        correos: [
          correo(1, {
            adjuntos: [
              { nombre: 'logo.png', parte: '2' },
              { nombre, parte: '3' },
            ],
          }),
        ],
      });
      await procesarLote(f.buzon, f.webhook, config());
      expect(f.descargas).toEqual([1]);
      expect(f.etiquetas.get(1)).toBe('Ferrotodo/procesada');
    },
  );

  it('(c) pasa la parte correcta al descargar', async () => {
    const partes: string[] = [];
    const f = armar({ correos: [correo(1, { adjuntos: [{ nombre: 'a.png', parte: '2' }, { nombre: 'a.zip', parte: '3' }] })] });
    const original = f.buzon.descargarAdjunto;
    f.buzon.descargarAdjunto = async (uid, parte) => {
      partes.push(parte);
      return original(uid, parte);
    };
    await procesarLote(f.buzon, f.webhook, config());
    expect(partes).toEqual(['3']);
  });

  it('(c) sin ZIP (solo png, o nombre nulo) -> rechazada', async () => {
    const f = armar({ correos: [correo(1, { adjuntos: [{ nombre: 'logo.png', parte: '2' }, { nombre: null, parte: '3' }] })] });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/rechazada');
    expect(r.correos[0].motivo).toMatch(/zip/i);
  });
});

describe('procesarLote: errores del parser', () => {
  it('(d) ZIP vacío (0 bytes) es transitorio: sin etiqueta', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: new Uint8Array(0) } });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.has(1)).toBe(false);
    expect(r.conteo.reintentar).toBe(1);
    expect(r.correos[0].resultado).toBe('reintentar');
    expect(f.envios).toHaveLength(0);
  });

  it('(d) ZIP corrupto es transitorio: sin etiqueta', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: new Uint8Array([1, 2, 3, 4, 5]) } });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.has(1)).toBe(false);
    expect(r.conteo.reintentar).toBe(1);
  });

  it('(d) ZIP sin XML es permanente -> rechazada', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: construirZip({ 'x.pdf': new Uint8Array([1]) }) } });
    await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/rechazada');
  });

  it('(d) nota crédito dentro del ZIP (ok:false) -> rechazada', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: construirZipFactura({ raiz: 'CreditNote', codigoTipo: null }) } });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/rechazada');
    expect(r.correos[0].motivo).toContain('NOTA_CREDITO');
    expect(f.envios).toHaveLength(0);
  });

  it('(d) datos incompletos (sin CUFE) -> rechazada', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: construirZipFactura({ cufe: null }) } });
    await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/rechazada');
  });

  it('(d) fallo al descargar (excepción) es transitorio: sin etiqueta', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: new Error('socket cerrado') } });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.has(1)).toBe(false);
    expect(r.correos[0]).toMatchObject({ resultado: 'reintentar' });
  });
});

describe('procesarLote: payload completado', () => {
  it('(e) agrega user_id y carpeta; no manda el ZIP sino el PDF', async () => {
    const f = armar({ correos: [correo(1)] });
    await procesarLote(f.buzon, f.webhook, config());
    const { payload, pdf } = f.envios[0];
    expect(payload.user_id).toBe(USER_ID);
    expect(payload.numero_factura).toBe('TEST1001');
    expect(payload.nombre_carpeta_factura).toBe('10/10/2026_TEST1001');
    expect(pdf).toMatchObject({ nombre: expect.stringMatching(/\.pdf$/) });
  });

  it('(e) sin vencimiento -> fecha_vencimiento = fecha_emision', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: construirZipFactura({ fechaEmision: '2026-09-30', dueDate: null, paymentDueDate: null }) } });
    await procesarLote(f.buzon, f.webhook, config());
    expect(f.envios[0].payload.fecha_emision).toBe('2026-09-30');
    expect(f.envios[0].payload.fecha_vencimiento).toBe('2026-09-30');
  });

  it('(e) con vencimiento propio lo respeta', async () => {
    const f = armar({ correos: [correo(1)], zips: { 1: construirZipFactura({ fechaEmision: '2026-09-30', dueDate: '2026-10-30' }) } });
    await procesarLote(f.buzon, f.webhook, config());
    expect(f.envios[0].payload.fecha_vencimiento).toBe('2026-10-30');
  });

  it('(e) carpeta sin ceros a la izquierda con fecha de PROCESO: 9/30/2026_...', async () => {
    const f = armar({ correos: [correo(1)] });
    await procesarLote(f.buzon, f.webhook, config({ reloj: () => Date.UTC(2026, 8, 30, 18, 0, 0) }));
    expect(f.envios[0].payload.nombre_carpeta_factura).toBe('9/30/2026_TEST1001');
  });

  it('(e) cerca de medianoche UTC usa el día de Bogotá (UTC-5)', async () => {
    // 2026-10-01 02:30 UTC = 2026-09-30 21:30 en Bogotá
    const f = armar({ correos: [correo(1)] });
    await procesarLote(f.buzon, f.webhook, config({ reloj: () => Date.UTC(2026, 9, 1, 2, 30, 0) }));
    expect(f.envios[0].payload.nombre_carpeta_factura).toBe('9/30/2026_TEST1001');
  });

  it('(e) 05:00 UTC ya es el día nuevo en Bogotá', async () => {
    const f = armar({ correos: [correo(1)] });
    await procesarLote(f.buzon, f.webhook, config({ reloj: () => Date.UTC(2026, 9, 1, 5, 0, 0) }));
    expect(f.envios[0].payload.nombre_carpeta_factura).toBe('10/1/2026_TEST1001');
  });
});

describe('procesarLote: respuesta del webhook', () => {
  it('(f) creado -> procesada', async () => {
    const f = armar({ correos: [correo(1)], envio: () => ({ tipo: 'creado' }) });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/procesada');
    expect(r.conteo.creada).toBe(1);
  });

  it('(f) duplicado -> procesada', async () => {
    const f = armar({ correos: [correo(1)], envio: () => ({ tipo: 'duplicado' }) });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/procesada');
    expect(r.conteo.duplicada).toBe(1);
  });

  it('(f) rechazado (4xx) -> rechazada con el detalle', async () => {
    const f = armar({ correos: [correo(1)], envio: () => ({ tipo: 'rechazado', estado: 400, detalle: 'Missing required fields' }) });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.get(1)).toBe('Ferrotodo/rechazada');
    expect(r.correos[0].motivo).toContain('Missing required fields');
  });

  it('(f) error (5xx/red) -> sin etiqueta', async () => {
    const f = armar({ correos: [correo(1)], envio: () => ({ tipo: 'error', detalle: 'HTTP 500' }) });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.has(1)).toBe(false);
    expect(r.conteo.reintentar).toBe(1);
  });

  it('(f) si el webhook lanza excepción, tampoco etiqueta', async () => {
    const f = armar({ correos: [correo(1)], envio: () => new Error('boom') });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(f.etiquetas.has(1)).toBe(false);
    expect(r.correos[0].resultado).toBe('reintentar');
  });
});

describe('procesarLote: lote', () => {
  it('(g) un correo que falla no aborta el resto', async () => {
    const f = armar({
      correos: [correo(1), correo(2), correo(3)],
      zips: { 1: new Error('se cayó'), 2: construirZipFactura() },
    });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(r.correos.map((c) => c.resultado)).toEqual(['reintentar', 'creada', 'creada']);
    expect(f.etiquetas.get(3)).toBe('Ferrotodo/procesada');
  });

  it('(g) si etiquetar falla, se registra y se sigue', async () => {
    const f = armar({ correos: [correo(1), correo(2)] });
    const original = f.buzon.etiquetar;
    f.buzon.etiquetar = async (uid, e) => {
      if (uid === 1) throw new Error('IMAP caído');
      return original(uid, e);
    };
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(r.correos[0].resultado).toBe('reintentar');
    expect(r.correos[1].resultado).toBe('creada');
  });

  it('respeta el límite del lote', async () => {
    const f = armar({ correos: [1, 2, 3, 4, 5].map((u) => correo(u)) });
    const r = await procesarLote(f.buzon, f.webhook, config({ limite: 3 }));
    expect(r.correos).toHaveLength(3);
  });

  it('el límite por defecto es 8', async () => {
    const f = armar({ correos: Array.from({ length: 12 }, (_, i) => correo(i + 1)) });
    const r = await procesarLote(f.buzon, f.webhook, config({ limite: undefined }));
    expect(r.correos).toHaveLength(8);
  });

  it('corta antes de tiempo al exceder el presupuesto y lo informa', async () => {
    let t = 0;
    const f = armar({ correos: [correo(1), correo(2), correo(3)] });
    const original = f.webhook.enviar;
    f.webhook.enviar = async (p, pdf) => {
      t += 60_000; // cada envío "tarda" 60 s
      return original(p, pdf);
    };
    const r = await procesarLote(f.buzon, f.webhook, config({ reloj: () => t, presupuestoMs: 100_000 }));
    expect(r.correos).toHaveLength(2); // a los 120 s ya no arranca el tercero
    expect(r.cortadoPorTiempo).toBe(true);
    expect(f.etiquetas.has(3)).toBe(false);
  });

  it('sin corte por tiempo informa false', async () => {
    const f = armar({ correos: [correo(1)] });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(r.cortadoPorTiempo).toBe(false);
  });

  it('el resumen no contiene PDFs ni base64', async () => {
    const f = armar({ correos: [correo(1)] });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(JSON.stringify(r)).not.toMatch(/JVBER|%PDF|base64/i);
    expect(r.correos[0]).toEqual({ uid: 1, numero: 'TEST1001', resultado: 'creada' });
  });

  it('buzón sin pendientes devuelve conteos en cero', async () => {
    const f = armar({ correos: [] });
    const r = await procesarLote(f.buzon, f.webhook, config());
    expect(r.conteo).toEqual({ creada: 0, duplicada: 0, ignorada: 0, rechazada: 0, reintentar: 0 });
  });
});
