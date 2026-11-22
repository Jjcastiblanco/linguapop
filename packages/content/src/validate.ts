import type { ZodError } from 'zod';
import { audioKey, collectPairTexts, collectSpokenTexts } from './audio';
import {
  READING_ID_PREFIX,
  READING_MIN_COVERAGE,
  ReadingTextsSchema,
  readingCoverage,
  type ReadingText,
} from './reading';
import {
  CourseSchema,
  MinimalPairsSchema,
  PAIR_ID_PREFIX,
  type Course,
  type MinimalPair,
} from './schema';

/**
 * Prefijos de id que el progreso trata aparte (palabras sueltas, pares y lecturas): ningún ejercicio
 * del curso puede empezar por ellos, o el pliegue lo confundiría con otro tipo de respuesta.
 */
export const RESERVED_EXERCISE_PREFIXES = ['w-', PAIR_ID_PREFIX, READING_ID_PREFIX] as const;

export type ContentProblemCode =
  | 'course-schema'
  | 'readings-schema'
  | 'pairs-schema'
  | 'reserved-prefix'
  | 'reading-unit'
  | 'reading-coverage'
  | 'audio-missing';

/** Un defecto del contenido y dónde está, para decírselo a quien lo escribió. */
export type ContentProblem = { code: ContentProblemCode; where: string; message: string };

/** El contenido completo que se publica junto: el curso y lo que viaja aparte. */
export type ContentBundle = {
  course: Course;
  readings: ReadingText[];
  pairs: MinimalPair[];
};

export type ContentValidation =
  { ok: true; content: ContentBundle } | { ok: false; problems: ContentProblem[] };

const path = (parts: ReadonlyArray<PropertyKey>): string => parts.map(String).join('.') || '(raíz)';

/** Ubicación de un defecto de esquema: la pieza y, en listas, el id de la entrada cuando lo tiene. */
function schemaProblems(
  code: 'course-schema' | 'readings-schema' | 'pairs-schema',
  piece: 'course' | 'readings' | 'pairs',
  error: ZodError,
  raw: unknown,
): ContentProblem[] {
  return error.issues.map((issue) => {
    const [first, ...rest] = issue.path;
    const entry = typeof first === 'number' && Array.isArray(raw) ? (raw[first] as unknown) : null;
    const id =
      typeof entry === 'object' && entry !== null && 'id' in entry ? String(entry.id) : null;
    const head = id ?? (first === undefined ? '' : String(first));
    const where = [piece, head, path(rest) === '(raíz)' ? '' : path(rest)]
      .filter(Boolean)
      .join('.');
    return { code, where, message: issue.message };
  });
}

/**
 * Valida un contenido completo antes de publicarlo o de usarlo: el esquema de cada pieza, que ningún
 * ejercicio use un prefijo reservado, que cada lectura apunte a una unidad del propio curso y tenga
 * al menos `READING_MIN_COVERAGE` de palabras ya enseñadas, y, si se pasan las claves de audio
 * disponibles, que todo lo que se dice tenga su grabación. Es pura y devuelve todos los problemas.
 */
export function validateContent(
  input: { course: unknown; readings?: unknown; pairs?: unknown },
  options: { audioKeys?: ReadonlySet<string> } = {},
): ContentValidation {
  const problems: ContentProblem[] = [];
  const course = CourseSchema.safeParse(input.course);
  if (!course.success) {
    problems.push(...schemaProblems('course-schema', 'course', course.error, input.course));
  }
  const rawReadings = input.readings ?? [];
  const readings = ReadingTextsSchema.safeParse(rawReadings);
  if (!readings.success) {
    problems.push(...schemaProblems('readings-schema', 'readings', readings.error, rawReadings));
  }
  const rawPairs = input.pairs ?? [];
  const pairs = MinimalPairsSchema.safeParse(rawPairs);
  if (!pairs.success) {
    problems.push(...schemaProblems('pairs-schema', 'pairs', pairs.error, rawPairs));
  }

  // Cada comprobación corre en cuanto sus piezas son válidas: un par roto no esconde una lectura rota.
  if (course.success) {
    for (const unit of course.data.units) {
      for (const exercise of unit.exercises) {
        const prefix = RESERVED_EXERCISE_PREFIXES.find((p) => exercise.id.startsWith(p));
        if (prefix) {
          problems.push({
            code: 'reserved-prefix',
            where: `${unit.id}.${exercise.id}`,
            message: `el id de un ejercicio no puede empezar por «${prefix}»: está reservado`,
          });
        }
      }
    }
  }
  if (course.success && readings.success) {
    const units = course.data.units;
    for (const text of readings.data) {
      if (!units.some((u) => u.id === text.unitId)) {
        problems.push({
          code: 'reading-unit',
          where: text.id,
          message: `la lectura apunta a la unidad «${text.unitId}», que no está en el curso`,
        });
        continue;
      }
      const { ratio, unknown } = readingCoverage(text, units);
      if (ratio < READING_MIN_COVERAGE) {
        problems.push({
          code: 'reading-coverage',
          where: text.id,
          message: `solo el ${(ratio * 100).toFixed(1)} % de las palabras está enseñado (mínimo ${READING_MIN_COVERAGE * 100} %); sin enseñar: ${unknown.join(', ')}`,
        });
      }
    }
  }
  if (course.success && pairs.success && options.audioKeys) {
    const keys = options.audioKeys;
    const spoken = [...collectSpokenTexts(course.data.units), ...collectPairTexts(pairs.data)];
    for (const s of spoken) {
      if (!keys.has(audioKey(s.text, s.speed, s.voice))) {
        problems.push({
          code: 'audio-missing',
          where: `audio: ${s.text}`,
          message: `falta la grabación de «${s.text}» (${s.speed}${s.voice ? `, voz ${s.voice}` : ''})`,
        });
      }
    }
  }
  return problems.length > 0 || !course.success || !readings.success || !pairs.success
    ? { ok: false, problems }
    : { ok: true, content: { course: course.data, readings: readings.data, pairs: pairs.data } };
}
