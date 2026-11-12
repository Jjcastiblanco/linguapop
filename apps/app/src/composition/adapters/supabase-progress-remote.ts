import {
  LEGACY_EVENT_TYPE,
  parseKnownEvents,
  type ProgressEvent,
  type ProgressRemote,
  type PullResult,
  type PushOutcome,
} from '@linguapop/domain';

/** Fila de `public.progress_events` tal como la entrega y la recibe el cliente. */
type EventRow = {
  id: string;
  type: string;
  payload: unknown;
  occurred_at: string;
  content_version: string | number;
  received_at: string;
  status: 'accepted' | 'rejected';
};

type RemoteError = { code?: string; message: string; status?: number };

/** Lo que el adaptador usa de supabase-js; las pruebas lo reemplazan por uno falso. */
export type EventsClientLike = {
  from(table: 'progress_events'): {
    upsert(
      rows: Array<
        Omit<EventRow, 'content_version' | 'received_at' | 'status'> & {
          content_version: string;
          source: 'app' | 'legacy';
        }
      >,
      options: { onConflict: 'id'; ignoreDuplicates: true },
    ): PromiseLike<{ error: RemoteError | null; status?: number }>;
    select(columns: string): OrderedQuery;
  };
};

type OrderedQuery = {
  /** Solo lo recibido por el servidor desde esa hora. */
  gte(column: 'received_at', value: string): OrderedQuery;
  /** El servidor guarda `rejected` los eventos que pasan el tope (AD-7): vienen junto a los demás. */
  order(column: 'received_at' | 'id', options: { ascending: true }): OrderedQuery;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: EventRow[] | null; error: RemoteError | null }>;
};

/** Cuántos eventos se envían o piden por llamada. */
export const PAGE_SIZE = 500;

/**
 * Cuánto antes del cursor se vuelve a pedir. Postgres da `received_at` al empezar la transacción, y
 * una que confirma tarde queda con una hora anterior a otra ya vista: el solape la recupera. Lo
 * repetido se ignora por su id.
 */
export const PULL_OVERLAP_MS = 5 * 60 * 1000;

/** Sin servidor: la app queda como invitado con el progreso solo local. */
export const unavailableRemote: ProgressRemote = {
  available: () => false,
  push: async () => ({ accepted: [], rejected: [] }),
  pull: async () => ({ events: [], rejected: [], cursor: null }),
};

/**
 * El servidor rechazó el evento de forma definitiva (datos que no cumplen sus reglas o permisos),
 * a diferencia de un fallo pasajero (sin red, sesión vencida, servidor caído) que se reintenta.
 */
function isDefinitive(error: RemoteError): boolean {
  const status = error.status ?? 0;
  if (status === 401 || status === 408 || status === 429) return false;
  if (status >= 400 && status < 500) return true;
  return /^(22|23)/.test(error.code ?? '');
}

const toRow = (e: ProgressEvent) => ({
  id: e.id,
  type: e.type,
  payload: e.payload,
  occurred_at: e.occurredAt,
  content_version: String(e.contentVersion),
  // La importación de lo heredado se distingue en el servidor del progreso hecho en la app.
  source: e.type === LEGACY_EVENT_TYPE ? ('legacy' as const) : ('app' as const),
});

const fromRow = (r: EventRow): unknown => ({
  id: r.id,
  type: r.type,
  payload: r.payload,
  // Postgres entrega la fecha con desfase (+00:00); el esquema pide la forma con Z.
  occurredAt: new Date(r.occurred_at).toISOString(),
  contentVersion: Number(r.content_version),
});

/** Copia de los eventos en Supabase (AD-6): el servidor pone el usuario y ignora ids repetidos. */
export function createSupabaseProgressRemote(client: EventsClientLike): ProgressRemote {
  async function insert(events: readonly ProgressEvent[]) {
    const { error, status } = await client
      .from('progress_events')
      .upsert(events.map(toRow), { onConflict: 'id', ignoreDuplicates: true });
    // supabase-js entrega el estado HTTP junto a la respuesta, no dentro del error.
    return error ? { ...error, status: error.status ?? status } : null;
  }

  return {
    available: () => true,
    async push(events) {
      const outcome: PushOutcome = { accepted: [], rejected: [] };
      for (let i = 0; i < events.length; i += PAGE_SIZE) {
        const page = events.slice(i, i + PAGE_SIZE);
        const error = await insert(page);
        if (!error) {
          outcome.accepted.push(...page.map((e) => e.id));
          continue;
        }
        if (!isDefinitive(error)) throw new Error(error.message);
        // Un evento malo rechaza todo el lote: se reenvían uno a uno para aislarlo.
        for (const event of page) {
          const single = await insert([event]);
          if (!single) outcome.accepted.push(event.id);
          else if (isDefinitive(single)) outcome.rejected.push(event.id);
          else throw new Error(single.message);
        }
      }
      return outcome;
    },
    async pull(since) {
      const sinceMs = since === null ? Number.NaN : Date.parse(since);
      const from = Number.isNaN(sinceMs) ? null : new Date(sinceMs - PULL_OVERLAP_MS).toISOString();
      const rows: EventRow[] = [];
      for (let start = 0; ; start += PAGE_SIZE) {
        let query = client
          .from('progress_events')
          .select('id, type, payload, occurred_at, content_version, received_at, status');
        if (from !== null) query = query.gte('received_at', from);
        const { data, error } = await query
          .order('received_at', { ascending: true })
          .order('id', { ascending: true })
          .range(start, start + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
      }
      // El cursor avanza con todo lo recibido, también lo rechazado o de un tipo que esta versión no
      // entiende; nunca retrocede. Se trunca a milisegundos, y el solape cubre la diferencia.
      let latest = Number.isNaN(sinceMs) ? Number.NEGATIVE_INFINITY : sinceMs;
      for (const r of rows) latest = Math.max(latest, Date.parse(r.received_at));
      const cursor = Number.isFinite(latest) ? new Date(latest).toISOString() : null;
      const result: PullResult = {
        events: parseKnownEvents(rows.filter((r) => r.status === 'accepted').map(fromRow)),
        rejected: rows.filter((r) => r.status === 'rejected').map((r) => r.id),
        cursor,
      };
      return result;
    },
  };
}
