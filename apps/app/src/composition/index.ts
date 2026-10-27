import { seedCourse } from '@linguapop/content';
import type { Clock, ContentSource, Random } from '@linguapop/domain';
import type { ProgressContext } from '@linguapop/domain';
import { createLocalProgressSink, type LocalProgressSink } from './adapters/local-progress-sink';
import { createLocalStore, type StorageLike, type WebLocalStore } from './adapters/local-store';

/** Todo lo que la app necesita del exterior, ya conectado. Se crea una sola vez al arrancar. */
export type Composition = {
  clock: Clock;
  random: Random;
  store: WebLocalStore;
  progressSink: LocalProgressSink;
  content: ContentSource;
  /** Estructura del contenido que el pliegue de eventos necesita. */
  progressContext: ProgressContext;
  /** Zona horaria del dispositivo, para decidir qué es "hoy". */
  timeZone: string;
  /** Versión del contenido con la que se marcan los eventos (0 = contenido semilla). */
  contentVersion: number;
  newId: () => string;
};

export type CompositionOverrides = Partial<
  Pick<Composition, 'clock' | 'random' | 'timeZone' | 'newId'>
> & {
  storage?: StorageLike | null;
};

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Raíz de composición (AD-10): el único lugar que elige adaptadores concretos para esta plataforma. */
export function createComposition(overrides: CompositionOverrides = {}): Composition {
  const store = createLocalStore(overrides.storage);
  const units = seedCourse.units.map((u) => ({ id: u.id, lessonIds: u.lessons.map((l) => l.id) }));
  return {
    clock: overrides.clock ?? { now: () => Date.now() },
    random: overrides.random ?? { next: () => Math.random() },
    store,
    progressSink: createLocalProgressSink(store),
    content: { load: async () => seedCourse },
    progressContext: { units, achievements: seedCourse.achievements },
    timeZone: overrides.timeZone ?? deviceTimeZone(),
    contentVersion: 0,
    newId: overrides.newId ?? (() => crypto.randomUUID()),
  };
}
