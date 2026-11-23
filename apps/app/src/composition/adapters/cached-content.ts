import {
  MinimalPairsSchema,
  ReadingTextsSchema,
  RemoteAudioSchema,
  parseCourseTolerant,
  validateContent,
  type Course,
  type MinimalPair,
  type RemoteAudio,
  type ReadingText,
} from '@linguapop/content';
import type { ContentRemote, LocalStore } from '@linguapop/domain';

export const CONTENT_CACHE_KEY = 'linguapop:content:v1';

/**
 * El contenido con el que se arranca y la versión de snapshot que lo respalda (0 = semilla).
 * `readings` y `pairs` solo están si el snapshot los trae válidos; si faltan, se usan los de la
 * semilla.
 */
export type LocalContent = {
  course: Course;
  version: number;
  readings?: ReadingText[];
  pairs?: MinimalPair[];
  audio?: RemoteAudio;
};

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
  /**
   * Una pieza opcional del snapshot (lecturas o pares), validada contra el curso del propio
   * snapshot. Un defecto la descarta entera (y se registra) sin tocar el curso ni la otra pieza.
   * Sin campo, o con `null`, no hay pieza propia y se usa la de la semilla.
   */
  function pieceOf<T>(
    piece: 'readings' | 'pairs' | 'audio',
    label: string,
    discarded: string,
    schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
    isMine: (code: string) => boolean,
    course: Course,
    content: unknown,
    version: number,
  ): T | undefined {
    const raw =
      typeof content === 'object' && content !== null
        ? (content as Record<string, unknown>)[piece]
        : undefined;
    if (raw === undefined || raw === null) return undefined;
    const result = validateContent({ course, [piece]: raw });
    // Si el propio curso no valida no hay contra qué comprobar la pieza: se descarta también.
    const problems = result.ok
      ? []
      : result.problems.filter((p) => p.code === 'course-schema' || isMine(p.code));
    if (problems.length > 0) {
      log(
        `${label} del snapshot ${version} ${discarded} (${discarded === 'descartadas' ? 'todas, no solo la defectuosa' : discarded === 'descartado' ? 'entero' : 'todos, no solo el defectuoso'}): ${problems.map((p) => `${p.where}: ${p.message}`).join('; ')}`,
      );
      return undefined;
    }
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }

  const readingsOf = (course: Course, content: unknown, version: number) =>
    pieceOf(
      'readings',
      'Lecturas',
      'descartadas',
      ReadingTextsSchema,
      (c) => c === 'readings-schema' || c.startsWith('reading-'),
      course,
      content,
      version,
    );

  const audioOf = (course: Course, content: unknown, version: number) =>
    pieceOf(
      'audio',
      'Audio',
      'descartado',
      RemoteAudioSchema,
      (c) => c === 'audio-schema',
      course,
      content,
      version,
    );

  const pairsOf = (course: Course, content: unknown, version: number) =>
    pieceOf(
      'pairs',
      'Pares',
      'descartados',
      MinimalPairsSchema,
      (c) => c === 'pairs-schema',
      course,
      content,
      version,
    );

  function read(raw: unknown): LocalContent | null {
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
    const readings = readingsOf(parsed.course, content, version);
    const pairs = pairsOf(parsed.course, content, version);
    const audio = audioOf(parsed.course, content, version);
    return {
      course: parsed.course,
      version,
      ...(readings ? { readings } : {}),
      ...(pairs ? { pairs } : {}),
      ...(audio ? { audio } : {}),
    };
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
      const current = (await cached())?.version ?? 0;
      // Primero solo el número de versión: si no hay nada nuevo no se baja el curso (cada arranque).
      if (remote.latestVersion) {
        let published;
        try {
          published = await remote.latestVersion(schemaVersion);
        } catch {
          return 'offline';
        }
        if (published === null || published <= current) return 'unchanged';
      }
      let snapshot;
      try {
        snapshot = await remote.latest(schemaVersion);
      } catch {
        return 'offline';
      }
      if (!snapshot) return 'unchanged';
      if (snapshot.version <= current) return 'unchanged';
      const parsed = parseCourseTolerant(snapshot.content);
      if (!parsed.ok) {
        log(`Snapshot ${snapshot.version} descartado: ${parsed.error}`);
        return 'invalid'; // se conserva el anterior
      }
      parsed.skipped.forEach((s) =>
        log(`Ejercicio omitido (${s.type} desconocido): ${s.unitId}/${s.exerciseId}`),
      );
      // Solo para registrar si se descartan; el arranque los vuelve a comprobar.
      readingsOf(parsed.course, snapshot.content, snapshot.version);
      pairsOf(parsed.course, snapshot.content, snapshot.version);
      audioOf(parsed.course, snapshot.content, snapshot.version);
      await store.set(
        CONTENT_CACHE_KEY,
        JSON.stringify({ schemaVersion, version: snapshot.version, content: snapshot.content }),
      );
      return 'updated';
    },
  };
}
