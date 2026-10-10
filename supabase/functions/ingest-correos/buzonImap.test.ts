import { describe, expect, it } from 'vitest';
import { consultaGmail, crearBuzonImap, listarAdjuntos, type ClienteImap } from './adaptadores/buzonImap.ts';

describe('buzonImap (con cliente falso)', () => {
  it('consultaGmail excluye las tres etiquetas y filtra por fecha', () => {
    const q = consultaGmail('2026/09/28');
    expect(q).toContain('after:2026/09/28');
    for (const e of ['procesada', 'rechazada', 'ignorada']) expect(q).toContain(`-label:Ferrotodo/${e}`);
  });

  it('listarAdjuntos toma nombre de disposición o de Content-Type, recursivo', () => {
    const r = listarAdjuntos({
      childNodes: [
        { part: '1' },
        { part: '2', dispositionParameters: { filename: 'a.zip' } },
        { part: '3', parameters: { name: 'b.png' } },
      ],
    });
    expect(r).toEqual([
      { nombre: 'a.zip', parte: '2' },
      { nombre: 'b.png', parte: '3' },
    ]);
  });

  it('descarta ya etiquetados (aunque el servidor los devuelva), ordena viejo->nuevo y corta al límite', async () => {
    const etiquetas: Record<number, string[]> = { 5: ['Ferrotodo/procesada'], 9: [], 3: [], 7: [], 8: ['\\Inbox'] };
    const cliente = {
      getMailboxLock: async () => ({ release() {} }),
      search: async () => [9, 5, 3, 7, 8],
      fetch: async function* (rango: number[], consulta: { labels?: boolean }) {
        for (const uid of rango) {
          yield consulta.labels
            ? { uid, labels: new Set(etiquetas[uid]) }
            : { uid, envelope: { subject: `s${uid}` }, bodyStructure: { part: '1', dispositionParameters: { filename: 'x.zip' } } };
        }
      },
      download: async () => ({}),
      messageFlagsAdd: async () => true,
    } as unknown as ClienteImap;
    const b = crearBuzonImap(cliente, { desde: '2026/09/28' });
    const r = await b.buscarPendientes(2);
    expect(r.map((c) => c.uid)).toEqual([3, 7]);
    expect(r[0]).toMatchObject({ asunto: 's3', adjuntos: [{ nombre: 'x.zip', parte: '1' }] });
  });

  it('descarga sin contenido = 0 bytes; etiquetar lanza si Gmail devuelve false', async () => {
    const cliente = {
      getMailboxLock: async () => ({ release() {} }),
      download: async () => ({}),
      messageFlagsAdd: async () => false,
    } as unknown as ClienteImap;
    const b = crearBuzonImap(cliente, { desde: 'x' });
    expect((await b.descargarAdjunto(1, '2')).length).toBe(0);
    await expect(b.etiquetar(1, 'Ferrotodo/procesada')).rejects.toThrow(/etiqueta/);
  });
});
