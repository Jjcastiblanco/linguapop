import {
  parseKnownEvents,
  type LocalStore,
  type ProgressEvent,
  type ProgressSink,
} from '@linguapop/domain';

export const EVENTS_KEY = 'linguapop:events:v1';

export type LocalProgressSink = ProgressSink & {
  /** Borra todo el progreso guardado. */
  clear(): Promise<void>;
};

/**
 * Registro de eventos de progreso local-primero: se guarda en el almacenamiento local como una
 * lista JSON. Un evento con un id ya guardado no se duplica y lo que esta versión no entiende
 * (datos corruptos, eventos de tipos desconocidos) se ignora al leer.
 */
export function createLocalProgressSink(store: LocalStore): LocalProgressSink {
  let cache: ProgressEvent[] | null = null;

  async function load(): Promise<ProgressEvent[]> {
    if (cache) return cache;
    const raw = await store.get(EVENTS_KEY);
    let parsed: unknown = [];
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = []; // JSON corrupto: se empieza de cero sin romper la app
      }
    }
    cache = Array.isArray(parsed) ? parseKnownEvents(parsed) : [];
    return cache;
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
    async clear() {
      cache = [];
      await store.remove(EVENTS_KEY);
    },
  };
}
