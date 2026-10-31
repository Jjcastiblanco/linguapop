import {
  parseKnownEvents,
  type LocalStore,
  type ProgressEvent,
  type ProgressSink,
} from '@linguapop/domain';

export const EVENTS_KEY = 'linguapop:events:v1';
export const REJECTED_KEY = 'linguapop:events-rejected:v1';

export type LocalProgressSink = ProgressSink & {
  /** Ids de eventos que el servidor rechazó: siguen guardados, pero no cuentan. */
  rejectedIds(): Promise<ReadonlySet<string>>;
  /** Marca eventos como rechazados por el servidor. */
  reject(ids: readonly string[]): Promise<void>;
  /** Borra todo el progreso guardado. */
  clear(): Promise<void>;
};

async function readJsonArray(store: LocalStore, key: string): Promise<unknown[]> {
  const raw = await store.get(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // JSON corrupto: se empieza de cero sin romper la app
  }
}

/**
 * Registro de eventos de progreso local-primero: se guarda en el almacenamiento local como una
 * lista JSON. Un evento con un id ya guardado no se duplica y lo que esta versión no entiende
 * (datos corruptos, eventos de tipos desconocidos) se ignora al leer.
 */
export function createLocalProgressSink(store: LocalStore): LocalProgressSink {
  let cache: ProgressEvent[] | null = null;
  let rejected: Set<string> | null = null;

  async function load(): Promise<ProgressEvent[]> {
    if (cache) return cache;
    cache = parseKnownEvents(await readJsonArray(store, EVENTS_KEY));
    return cache;
  }

  async function loadRejected(): Promise<Set<string>> {
    if (rejected) return rejected;
    const ids = await readJsonArray(store, REJECTED_KEY);
    rejected = new Set(ids.filter((id): id is string => typeof id === 'string'));
    return rejected;
  }

  return {
    async append(event) {
      const events = await load();
      if (events.some((e) => e.id === event.id)) return;
      events.push(event);
      await store.set(EVENTS_KEY, JSON.stringify(events));
    },
    async readAll() {
      return [...(await load())];
    },
    async rejectedIds() {
      return new Set(await loadRejected());
    },
    async reject(ids) {
      const set = await loadRejected();
      const before = set.size;
      ids.forEach((id) => set.add(id));
      if (set.size !== before) await store.set(REJECTED_KEY, JSON.stringify([...set]));
    },
    async clear() {
      cache = [];
      rejected = new Set();
      await store.remove(EVENTS_KEY);
      await store.remove(REJECTED_KEY);
    },
  };
}
