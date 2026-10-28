import {
  completeEvent,
  foldEvents,
  initialProgress,
  type PendingEvent,
  type ProgressEvent,
  type ProgressState,
} from '@linguapop/domain';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Composition } from '../composition';

export type ProgressStoreState = {
  /** Ya se leyeron los eventos guardados. */
  ready: boolean;
  events: ProgressEvent[];
  /** El estado del estudiante: siempre es el pliegue de `events`. */
  progress: ProgressState;
  load: () => Promise<void>;
  /** Guarda eventos nuevos (con id, instante y versión) y reconstruye el estado. */
  record: (pending: readonly PendingEvent[]) => Promise<void>;
  /** Reemplaza todo el progreso por estos eventos y reconstruye el estado. */
  importEvents: (events: readonly ProgressEvent[]) => Promise<void>;
  /** Borra todo el progreso. */
  reset: () => Promise<void>;
};

export type ProgressStore = StoreApi<ProgressStoreState>;

export function createProgressStore(c: Composition): ProgressStore {
  let lastMs = 0;
  let queue: Promise<void> = Promise.resolve();
  /** Cada evento recibe un instante propio y creciente, así el orden de guardado se conserva al plegar. */
  const stamp = () => (lastMs = Math.max(c.clock.now(), lastMs + 1));

  const store: ProgressStore = createStore<ProgressStoreState>((set, get) => {
    /** Toma estos eventos como el progreso actual. */
    const adopt = async (events: ProgressEvent[], extra: { ready?: boolean } = {}) => {
      lastMs = events.reduce((m, e) => Math.max(m, Date.parse(e.occurredAt)), 0);
      set({ events, progress: foldEvents(events, c.progressContext), ...extra });
      // La zona horaria decide qué es "hoy": se registra la del dispositivo si cambió.
      if (get().progress.settings.timeZone !== c.timeZone) {
        await get().record([{ type: 'settings_changed@1', payload: { timeZone: c.timeZone } }]);
      }
    };
    return {
      ready: false,
      events: [],
      progress: initialProgress(),
      async load() {
        await adopt(await c.progressSink.readAll(), { ready: true });
      },
      async importEvents(events) {
        await c.progressSink.clear();
        for (const e of events) await c.progressSink.append(e);
        await adopt(await c.progressSink.readAll());
      },
      record(pending) {
        // Los instantes se asignan ya, en orden de llamada; el guardado va en cola para que dos
        // registros seguidos no pisen el estado del otro.
        const nuevos = pending.map((p) =>
          completeEvent(p, { id: c.newId(), nowMs: stamp(), contentVersion: c.contentVersion }),
        );
        const guardado = queue.then(async () => {
          for (const e of nuevos) await c.progressSink.append(e);
          const events = [...get().events, ...nuevos];
          set({ events, progress: foldEvents(events, c.progressContext) });
        });
        queue = guardado.catch(() => undefined);
        return guardado;
      },
      async reset() {
        await c.progressSink.clear();
        lastMs = 0;
        set({ events: [], progress: initialProgress() });
      },
    };
  });
  return store;
}
