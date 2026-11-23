import {
  audioKey,
  collectPairTexts,
  collectSpokenTexts,
  type RemoteAudio,
  type SpokenText,
} from './audio';
import type { ReadingText } from './reading';
import type { Course, MinimalPair } from './schema';

/** Lo que se pide publicar: el curso, lo que viaja aparte y de dónde sale el audio nuevo. */
export type PublishInput = {
  course: Course;
  readings: ReadingText[];
  pairs: MinimalPair[];
};

/** Todo lo que el contenido dice con la voz del curso, por clave (sin repetidos). */
export function neededAudio(
  input: Pick<PublishInput, 'course' | 'pairs'>,
): Map<string, SpokenText> {
  const spoken = [...collectSpokenTexts(input.course.units), ...collectPairTexts(input.pairs)];
  return new Map(spoken.map((s) => [audioKey(s.text, s.speed, s.voice), s]));
}

export type AudioPlan = {
  /** Claves que ya vienen empaquetadas en la app: no se suben. */
  bundled: string[];
  /** Claves del snapshot (no empaquetadas), ordenadas: es el `audio.keys` publicado. */
  remote: string[];
  /** De las remotas, las que aún no están en el bucket y hay que generar y subir. */
  toGenerate: string[];
};

/** Reparte el audio necesario entre lo empaquetado, lo ya subido y lo que falta generar. */
export function planAudio(
  needed: ReadonlyMap<string, SpokenText>,
  bundledKeys: ReadonlySet<string>,
  uploadedKeys: ReadonlySet<string>,
): AudioPlan {
  const keys = [...needed.keys()].sort();
  const bundled = keys.filter((k) => bundledKeys.has(k));
  const remote = keys.filter((k) => !bundledKeys.has(k));
  return { bundled, remote, toGenerate: remote.filter((k) => !uploadedKeys.has(k)) };
}

/** El objeto que se guarda como borrador: el curso con lecturas, pares y audio aparte. */
export function buildContent(
  input: PublishInput,
  audio: RemoteAudio | null,
): Record<string, unknown> {
  // Un `audio` en la cabecera del curso nunca se cuela: solo vale el que se calcula aquí.
  const { audio: _cabecera, ...course } = input.course as Course & { audio?: unknown };
  void _cabecera;
  return {
    ...course,
    readings: input.readings,
    pairs: input.pairs,
    ...(audio && audio.keys.length > 0 ? { audio } : {}),
  };
}

const idsOf = (list: unknown): Map<string, string> => {
  const map = new Map<string, string>();
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === 'object' && item !== null && 'id' in item) {
        map.set(String((item as { id: unknown }).id), JSON.stringify(item));
      }
    }
  }
  return map;
};

function diffIds(label: string, fem: boolean, before: unknown, after: unknown): string[] {
  const o = fem ? 'a' : 'o';
  const a = idsOf(before);
  const b = idsOf(after);
  const added = [...b.keys()].filter((id) => !a.has(id));
  const removed = [...a.keys()].filter((id) => !b.has(id));
  const changed = [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id));
  const lines: string[] = [];
  if (added.length) lines.push(`${label} nuev${o}s: ${added.join(', ')}`);
  if (changed.length) lines.push(`${label} cambiad${o}s: ${changed.join(', ')}`);
  if (removed.length) lines.push(`${label} quitad${o}s: ${removed.join(', ')}`);
  return lines;
}

/**
 * Qué cambia un contenido respecto del publicado, en líneas legibles para quien lo aprueba:
 * unidades, lecturas y pares por id (nuevos, cambiados, quitados) y el audio remoto. Sin cambios
 * devuelve una lista vacía.
 */
export function summarizeChange(published: unknown, next: unknown): string[] {
  const field = (content: unknown, name: string): unknown =>
    typeof content === 'object' && content !== null
      ? (content as Record<string, unknown>)[name]
      : undefined;
  const lines = [
    ...diffIds('Unidades', true, field(published, 'units'), field(next, 'units')),
    ...diffIds('Lecturas', true, field(published, 'readings'), field(next, 'readings')),
    ...diffIds('Pares', false, field(published, 'pairs'), field(next, 'pairs')),
  ];
  const keysOf = (content: unknown): Set<string> => {
    const audio = field(content, 'audio');
    const keys =
      typeof audio === 'object' && audio !== null ? (audio as { keys?: unknown }).keys : [];
    return new Set(Array.isArray(keys) ? keys.map(String) : []);
  };
  const before = keysOf(published);
  const after = keysOf(next);
  const added = [...after].filter((k) => !before.has(k)).length;
  const removed = [...before].filter((k) => !after.has(k)).length;
  if (added || removed) lines.push(`Audio remoto: ${added} clips nuevos, ${removed} quitados`);
  const rest = (content: unknown) => {
    if (typeof content !== 'object' || content === null) return '';
    const { units, readings, pairs, audio, dialogues, achievements, ...others } = content as Record<
      string,
      unknown
    >;
    (void units, readings, pairs, audio);
    return JSON.stringify({ others, dialogues, achievements });
  };
  if (rest(published) !== rest(next)) lines.push('Diálogos, logros o datos generales cambiados');
  return lines;
}

/** JSON con las claves ordenadas: dos contenidos iguales dan el mismo texto. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
