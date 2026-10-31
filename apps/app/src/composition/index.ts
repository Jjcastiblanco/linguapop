import { seedCourse } from '@linguapop/content';
import type { Course } from '@linguapop/content';
import type {
  Auth,
  Clock,
  ContentRemote,
  ContentSource,
  ProgressRemote,
  Random,
  Speech,
} from '@linguapop/domain';
import type { ProgressContext } from '@linguapop/domain';
import { createLocalProgressSink, type LocalProgressSink } from './adapters/local-progress-sink';
import { createLocalStore, type StorageLike, type WebLocalStore } from './adapters/local-store';
import { createWebInstall, type WebInstall } from './adapters/web-install';
import { createWebUpdate, type WebUpdate } from './adapters/web-update';
import { createWebSound, type WebSound } from './adapters/web-sound';
import { createWebSpeech } from './adapters/web-speech';
import { createCachedContent } from './adapters/cached-content';
import { createSupabaseServices } from './adapters/supabase';

/** Todo lo que la app necesita del exterior, ya conectado. Se crea una sola vez al arrancar. */
export type Composition = {
  clock: Clock;
  random: Random;
  store: WebLocalStore;
  progressSink: LocalProgressSink;
  content: ContentSource;
  /** El curso con el que se dibuja la app (hoy el contenido semilla; luego el publicado). */
  course: Course;
  /** Voz del navegador: habla y escucha, y dice cuándo no puede. */
  speech: Speech;
  /** Sonidos con Web Audio; respeta la preferencia de sonido del dispositivo. */
  sound: WebSound;
  /** Instalación como PWA: dice si se puede ofrecer y lanza el aviso del navegador. */
  install: WebInstall;
  /** Versión nueva de la app lista para activar (la ofrece el service worker). */
  update: WebUpdate;
  /** Cuentas y sesión; sin Supabase configurado la app es solo de invitado. */
  auth: Auth;
  /** Copia del progreso en el servidor; sin Supabase configurado no hay nada que sincronizar. */
  progressRemote: ProgressRemote;
  /** Estructura del contenido que el pliegue de eventos necesita. */
  progressContext: ProgressContext;
  /** Zona horaria del dispositivo, para decidir qué es "hoy". */
  timeZone: string;
  /** Versión del contenido con la que se marcan los eventos (0 = contenido semilla). */
  contentVersion: number;
  newId: () => string;
};

export type CompositionOverrides = Partial<
  Pick<
    Composition,
    | 'clock'
    | 'random'
    | 'timeZone'
    | 'newId'
    | 'speech'
    | 'sound'
    | 'course'
    | 'install'
    | 'update'
    | 'auth'
    | 'progressRemote'
    | 'store'
    | 'contentVersion'
  >
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
  const store = overrides.store ?? createLocalStore(overrides.storage);
  const course = overrides.course ?? seedCourse;
  // Un solo cliente de Supabase para las cuentas y la copia del progreso; solo se crea si hace falta.
  const supabase =
    overrides.auth && overrides.progressRemote
      ? null
      : createSupabaseServices({
          url: import.meta.env.VITE_SUPABASE_URL,
          anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        });
  const units = course.units.map((u) => ({ id: u.id, lessonIds: u.lessons.map((l) => l.id) }));
  return {
    clock: overrides.clock ?? { now: () => Date.now() },
    random: overrides.random ?? { next: () => Math.random() },
    store,
    progressSink: createLocalProgressSink(store),
    content: { load: async () => course },
    course,
    speech: overrides.speech ?? createWebSpeech(),
    sound: overrides.sound ?? createWebSound(),
    install: overrides.install ?? createWebInstall(),
    update: overrides.update ?? createWebUpdate(),
    auth: overrides.auth ?? supabase!.auth,
    progressRemote: overrides.progressRemote ?? supabase!.progressRemote,
    progressContext: { units, achievements: course.achievements },
    timeZone: overrides.timeZone ?? deviceTimeZone(),
    contentVersion: overrides.contentVersion ?? 0,
    newId: overrides.newId ?? (() => crypto.randomUUID()),
  };
}

/** Versión del esquema de contenido que esta app sabe leer (la del contenido semilla). */
const CONTENT_SCHEMA_VERSION = seedCourse.schemaVersion;

/**
 * Arranque con contenido publicado (AD-5): lee del almacenamiento local el último snapshot bueno
 * (o la semilla), compone con él y pide el vigente al servidor en segundo plano para el próximo
 * arranque. No espera a la red, así que no retrasa la primera pantalla.
 */
export async function composeWithContent(
  make: (overrides: CompositionOverrides) => Composition = createComposition,
  overrides: CompositionOverrides & { contentRemote?: ContentRemote } = {},
): Promise<Composition> {
  const store = overrides.store ?? createLocalStore(overrides.storage);
  const supabase = createSupabaseServices({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  const content = createCachedContent({
    store,
    remote: overrides.contentRemote ?? supabase.contentRemote,
    seed: overrides.course ?? seedCourse,
    schemaVersion: CONTENT_SCHEMA_VERSION,
  });
  const { course, version } = await content.loadLocal();
  const composition = make({
    auth: supabase.auth,
    progressRemote: supabase.progressRemote,
    ...overrides,
    store,
    course,
    contentVersion: version,
  });
  void content.refresh().catch(() => undefined);
  return composition;
}
