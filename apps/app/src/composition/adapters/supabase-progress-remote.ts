import {
  parseKnownEvents,
  type ProgressEvent,
  type ProgressRemote,
  type PushOutcome,
} from '@linguapop/domain';

/** Fila de `public.progress_events` tal como la entrega y la recibe el cliente. */
type EventRow = {
  id: string;
  type: string;
  payload: unknown;
  occurred_at: string;
  content_version: string | number;
};

type RemoteError = { code?: string; message: string; status?: number };

/** Lo que el adaptador usa de supabase-js; las pruebas lo reemplazan por uno falso. */
export type EventsClientLike = {
  from(table: 'progress_events'): {
    upsert(
      rows: Array<Omit<EventRow, 'content_version'> & { content_version: string; source: 'app' }>,
      options: { onConflict: 'id'; ignoreDuplicates: true },
    ): PromiseLike<{ error: RemoteError | null; status?: number }>;
    select(columns: string): OrderedQuery;
  };
};

type OrderedQuery = {
  order(column: 'occurred_at' | 'id', options: { ascending: true }): OrderedQuery;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: EventRow[] | null; error: RemoteError | null }>;
};

/** Cuántos eventos se envían o piden por llamada. */
export const PAGE_SIZE = 500;

/** Sin servidor: la app queda como invitado con el progreso solo local. */
export const unavailableRemote: ProgressRemote = {
  available: () => false,
  push: async () => ({ accepted: [], rejected: [] }),
  pull: async () => [],
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
  source: 'app' as const,
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
    async pull() {
      const rows: EventRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('progress_events')
          .select('id, type, payload, occurred_at, content_version')
          .order('occurred_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
      }
      return parseKnownEvents(rows.map(fromRow));
    },
  };
}
