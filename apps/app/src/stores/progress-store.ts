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
  /** Borra todo el progreso. */
  reset: () => Promise<void>;
};

export type ProgressStore = StoreApi<ProgressStoreState>;

export function createProgressStore(c: Composition): ProgressStore {
  let lastMs = 0;
  /** Cada evento recibe un instante propio y creciente, así el orden de guardado se conserva al plegar. */
  const stamp = () => (lastMs = Math.max(c.clock.now(), lastMs + 1));

  const store: ProgressStore = createStore<ProgressStoreState>((set, get) => ({
    ready: false,
    events: [],
    progress: initialProgress(),
    async load() {
      const events = await c.progressSink.readAll();
      lastMs = events.reduce((m, e) => Math.max(m, Date.parse(e.occurredAt)), 0);
      set({ events, progress: foldEvents(events, c.progressContext), ready: true });
      // La zona horaria decide qué es "hoy": se registra la del dispositivo si cambió.
      if (get().progress.settings.timeZone !== c.timeZone) {
        await get().record([{ type: 'settings_changed@1', payload: { timeZone: c.timeZone } }]);
      }
    },
    async record(pending) {
      const nuevos = pending.map((p) =>
        completeEvent(p, { id: c.newId(), nowMs: stamp(), contentVersion: c.contentVersion }),
      );
      for (const e of nuevos) await c.progressSink.append(e);
      const events = [...get().events, ...nuevos];
      set({ events, progress: foldEvents(events, c.progressContext) });
    },
    async reset() {
      await c.progressSink.clear();
      lastMs = 0;
      set({ events: [], progress: initialProgress() });
    },
  }));
  return store;
}
