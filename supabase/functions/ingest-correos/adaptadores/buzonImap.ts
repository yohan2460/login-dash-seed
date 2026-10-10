// Adaptador ImapFlow del puerto Buzon. Delgado a propósito: no se prueba contra
// Gmail en Vitest. Lo que hace:
//   - busca con X-GM-RAW (sintaxis de búsqueda de Gmail), del más viejo al más nuevo
//   - etiqueta con X-GM-LABELS (useLabels)
//   - NUNCA borra, mueve ni marca como leído (el buzón se abre con escritura
//     solo porque etiquetar lo exige).
import { Buffer } from 'node:buffer';
import type { AdjuntoCorreo, Buzon, CorreoCandidato, Etiqueta } from '../procesarLote.ts';

// Subconjunto de ImapFlow que usamos, para no depender de `any` ni de sus tipos.
interface NodoMime {
  part?: string;
  disposition?: string;
  dispositionParameters?: { filename?: string };
  parameters?: { name?: string };
  childNodes?: NodoMime[];
}
interface MensajeImap {
  uid: number;
  labels?: Set<string>;
  envelope?: { subject?: string };
  bodyStructure?: NodoMime;
}
export interface ClienteImap {
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: { gmraw: string }, opciones: { uid: boolean }): Promise<number[] | false>;
  fetch(
    rango: number[],
    consulta: { uid?: boolean; labels?: boolean; envelope?: boolean; bodyStructure?: boolean },
    opciones: { uid: boolean },
  ): AsyncIterable<MensajeImap>;
  download(
    rango: string,
    parte: string,
    opciones: { uid: boolean },
  ): Promise<{ content?: AsyncIterable<Uint8Array | string> }>;
  messageFlagsAdd(rango: number[], etiquetas: string[], opciones: { uid: boolean; useLabels: boolean }): Promise<boolean>;
}

export interface OpcionesBuzon {
  /** Fecha mínima en formato Gmail: YYYY/MM/DD. */
  desde: string;
}

const PREFIJO_ETIQUETA = 'Ferrotodo/';

// Etiqueta que ponía n8n a cada factura cargada; el equipo la usa en Gmail para
// saber qué ya se extrajo, así que la seguimos poniendo junto a la nuestra.
const ETIQUETA_LEGADO_N8N = 'Extraido_IA';
const etiquetasAAplicar = (e: Etiqueta): string[] =>
  e === 'Ferrotodo/procesada' ? [e, ETIQUETA_LEGADO_N8N] : [e];

// Gmail a veces manda el ZIP sin Content-Disposition: attachment; por eso se mira
// también el parámetro "name" del Content-Type.
export function listarAdjuntos(nodo: NodoMime | undefined, acc: AdjuntoCorreo[] = []): AdjuntoCorreo[] {
  if (!nodo) return acc;
  const nombre = nodo.dispositionParameters?.filename ?? nodo.parameters?.name ?? null;
  if (nombre || nodo.disposition === 'attachment') acc.push({ nombre, parte: nodo.part ?? '1' });
  for (const hijo of nodo.childNodes ?? []) listarAdjuntos(hijo, acc);
  return acc;
}

export function consultaGmail(desde: string): string {
  // Las exclusiones del lado servidor son una optimización; la garantía real es
  // el filtro por labels de abajo (si Gmail interpretara distinto el "/" de las
  // etiquetas anidadas, sin el filtro el backlog se quedaría atascado).
  return [
    'in:inbox',
    'filename:zip',
    `after:${desde}`,
    '-label:Ferrotodo/procesada',
    '-label:Ferrotodo/rechazada',
    '-label:Ferrotodo/ignorada',
  ].join(' ');
}

export function crearBuzonImap(cliente: ClienteImap, op: OpcionesBuzon): Buzon & { cerrar(): void } {
  let lock: { release(): void } | null = null;

  const abrir = async (): Promise<void> => {
    if (!lock) lock = await cliente.getMailboxLock('INBOX'); // escritura: etiquetar lo necesita
  };

  return {
    async buscarPendientes(limite: number): Promise<CorreoCandidato[]> {
      await abrir();
      const uids = (await cliente.search({ gmraw: consultaGmail(op.desde) }, { uid: true })) || [];
      if (uids.length === 0) return [];
      uids.sort((a, b) => a - b); // más viejo primero: respeta el orden del backlog

      // Filtro de seguridad por etiquetas (ver consultaGmail).
      const pendientes: number[] = [];
      for await (const m of cliente.fetch(uids, { uid: true, labels: true }, { uid: true })) {
        const marcado = [...(m.labels ?? [])].some((l) => l.startsWith(PREFIJO_ETIQUETA));
        if (!marcado) pendientes.push(m.uid);
      }
      pendientes.sort((a, b) => a - b);
      const elegidos = pendientes.slice(0, limite);
      if (elegidos.length === 0) return [];

      const correos: CorreoCandidato[] = [];
      for await (const m of cliente.fetch(elegidos, { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
        correos.push({ uid: m.uid, asunto: m.envelope?.subject ?? '', adjuntos: listarAdjuntos(m.bodyStructure) });
      }
      return correos.sort((a, b) => a.uid - b.uid);
    },

    async descargarAdjunto(uid: number, parte: string): Promise<Uint8Array> {
      await abrir();
      const r = await cliente.download(String(uid), parte, { uid: true });
      // Sin `content` devolvemos 0 bytes: el parser lo clasifica ZIP_VACIO (transitorio).
      if (!r?.content) return new Uint8Array(0);
      const trozos: Buffer[] = [];
      for await (const t of r.content) trozos.push(typeof t === 'string' ? Buffer.from(t) : Buffer.from(t));
      return new Uint8Array(Buffer.concat(trozos));
    },

    async etiquetar(uid: number, etiqueta: Etiqueta): Promise<void> {
      await abrir();
      // messageFlagsAdd devuelve false (sin lanzar) si no pudo aplicar; lo volvemos error.
      const ok = await cliente.messageFlagsAdd([uid], etiquetasAAplicar(etiqueta), { uid: true, useLabels: true });
      if (!ok) throw new Error(`Gmail no aplicó la etiqueta ${etiqueta} al uid ${uid}`);
    },

    cerrar(): void {
      lock?.release();
      lock = null;
    },
  };
}
