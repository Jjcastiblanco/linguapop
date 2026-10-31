import { parseCourseTolerant, type Course } from '@linguapop/content';
import type { ContentRemote, LocalStore } from '@linguapop/domain';

export const CONTENT_CACHE_KEY = 'linguapop:content:v1';

/** El contenido con el que se arranca y la versión de snapshot que lo respalda (0 = semilla). */
export type LocalContent = { course: Course; version: number };

export type RefreshResult = 'updated' | 'unchanged' | 'offline' | 'invalid' | 'skipped';

export type CachedContentOptions = {
  store: LocalStore;
  remote: ContentRemote;
  /** Contenido incluido en la app: lo que se usa sin caché. */
  seed: Course;
  /** Versión del esquema de contenido que esta app entiende; solo lee el puntero de la suya. */
  schemaVersion: number;
  /** Dónde se registra lo que se omite o descarta; por defecto la consola. */
  log?: (message: string) => void;
};

/**
 * Contenido remoto con caché local (AD-5). `loadLocal` solo lee del almacenamiento y nunca espera
 * a la red, así no bloquea la interfaz; `refresh` consulta el servidor, valida y guarda el
 * snapshot nuevo para el próximo arranque, sin cambiar el curso mientras se estudia.
 */
export function createCachedContent({
  store,
  remote,
  seed,
  schemaVersion,
  log = (m) => console.warn(m),
}: CachedContentOptions) {
  function read(raw: unknown): { course: Course; version: number } | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const { schemaVersion: sv, version, content } = raw as Record<string, unknown>;
    if (sv !== schemaVersion || typeof version !== 'number' || !Number.isInteger(version)) {
      return null;
    }
    const parsed = parseCourseTolerant(content);
    if (!parsed.ok) return null;
    parsed.skipped.forEach((s) =>
      log(`Ejercicio omitido (${s.type} desconocido): ${s.unitId}/${s.exerciseId}`),
    );
    return { course: parsed.course, version };
  }

  async function cached(): Promise<LocalContent | null> {
    const text = await store.get(CONTENT_CACHE_KEY);
    if (!text) return null;
    try {
      const found = read(JSON.parse(text));
      if (found) return found;
    } catch {
      // caché ilegible: se trata como si no existiera
    }
    await store.remove(CONTENT_CACHE_KEY);
    return null;
  }

  return {
    async loadLocal(): Promise<LocalContent> {
      return (await cached()) ?? { course: seed, version: 0 };
    },

    async refresh(): Promise<RefreshResult> {
      if (!remote.available()) return 'skipped';
      let snapshot;
      try {
        snapshot = await remote.latest(schemaVersion);
      } catch {
        return 'offline';
      }
      if (!snapshot) return 'unchanged';
      const current = (await cached())?.version ?? 0;
      if (snapshot.version <= current) return 'unchanged';
      const parsed = parseCourseTolerant(snapshot.content);
      if (!parsed.ok) {
        log(`Snapshot ${snapshot.version} descartado: ${parsed.error}`);
        return 'invalid'; // se conserva el anterior
      }
      parsed.skipped.forEach((s) =>
        log(`Ejercicio omitido (${s.type} desconocido): ${s.unitId}/${s.exerciseId}`),
      );
      await store.set(
        CONTENT_CACHE_KEY,
        JSON.stringify({ schemaVersion, version: snapshot.version, content: snapshot.content }),
      );
      return 'updated';
    },
  };
}
