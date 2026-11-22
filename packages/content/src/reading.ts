import { z } from 'zod';
import { normalizeTerm } from './teach';
import type { Exercise, Unit } from './schema';

const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id inválido: minúsculas, números y guiones');
const Texto = z.string().trim().min(1, 'el texto no puede estar vacío');

/** Prefijo de los ids de lectura; el dominio lo comparte como `READING_EXERCISE_PREFIX`. */
export const READING_ID_PREFIX = 'read-';

/** Al menos esta parte de las palabras de un texto debe estar ya enseñada. */
export const READING_MIN_COVERAGE = 0.95;

export const READING_KINDS = ['message', 'sign', 'dialogue'] as const;

const ReadingQuestionSchema = z
  .object({
    /** Número de la línea del texto a la que se refiere la pregunta (desde 0). */
    line: z.number().int().min(0),
    /** La pregunta, en español. */
    prompt: Texto,
    options: z.array(Texto).min(2).max(4),
    answerIndex: z.number().int().min(0),
  })
  .refine((q) => q.answerIndex < q.options.length, {
    message: 'answerIndex debe apuntar a una opción existente',
    path: ['answerIndex'],
  })
  .refine((q) => new Set(q.options).size === q.options.length, {
    message: 'las opciones no pueden repetirse',
    path: ['options'],
  });

/** Un texto corto en inglés hecho con palabras ya enseñadas, con preguntas de comprensión. */
export const ReadingTextSchema = z
  .object({
    id: Slug.refine((id) => id.startsWith(READING_ID_PREFIX), {
      message: `el id de un texto debe empezar por ${READING_ID_PREFIX}`,
    }),
    /** El texto se abre al completar esta unidad: sus palabras ya están enseñadas. */
    unitId: Slug,
    kind: z.enum(READING_KINDS),
    title: Texto,
    lines: z.array(Texto).min(3).max(6),
    questions: z.array(ReadingQuestionSchema).min(2).max(3),
  })
  .superRefine((text, ctx) => {
    text.questions.forEach((q, i) => {
      if (q.line >= text.lines.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'la pregunta apunta a una línea que no existe',
          path: ['questions', i, 'line'],
        });
      }
    });
  });

export const ReadingTextsSchema = z.array(ReadingTextSchema).superRefine((texts, ctx) => {
  const ids = new Set<string>();
  texts.forEach((t, i) => {
    if (ids.has(t.id)) {
      ctx.addIssue({ code: 'custom', message: `id de texto repetido: ${t.id}`, path: [i, 'id'] });
    }
    ids.add(t.id);
  });
});

export type ReadingText = z.infer<typeof ReadingTextSchema>;

/**
 * Las preguntas de un texto como ejercicios de opción múltiple que se pueden repasar solos. El id
 * de cada pregunta es posicional (`<texto>-q1`…): para cambiar un texto ya publicado se añaden
 * preguntas al final; reordenar o quitar apuntaría el repaso guardado a otra pregunta.
 */
export function readingExercises(text: ReadingText): Exercise[] {
  return text.questions.map((q, i): Exercise => ({
    id: `${text.id}-q${i + 1}`,
    type: 'mc',
    prompt: `En el texto: «${text.lines[q.line]}» ${q.prompt}`,
    options: q.options.map((option) => ({ emoji: '📖', text: option })),
    answerIndex: q.answerIndex,
  }));
}

const tokens = (text: string): string[] => normalizeTerm(text).split(' ').filter(Boolean);

/** Las palabras que enseñan las tarjetas de las unidades hasta `unitId` incluida, normalizadas. */
export function taughtVocabulary(units: readonly Unit[], unitId: string): Set<string> {
  const upTo = units.findIndex((u) => u.id === unitId);
  const vocabulary = new Set<string>();
  if (upTo === -1) return vocabulary;
  for (const unit of units.slice(0, upTo + 1)) {
    for (const lesson of unit.lessons) {
      for (const card of lesson.teach ?? []) tokens(card.en).forEach((w) => vocabulary.add(w));
    }
  }
  return vocabulary;
}

/** Qué parte de las palabras de un texto ya estaba enseñada, y cuáles no. */
export function readingCoverage(
  text: ReadingText,
  units: readonly Unit[],
): { ratio: number; unknown: string[] } {
  const vocabulary = taughtVocabulary(units, text.unitId);
  const words = text.lines.flatMap(tokens);
  const unknown = words.filter((w) => !vocabulary.has(w));
  return {
    ratio: words.length ? 1 - unknown.length / words.length : 0,
    unknown: [...new Set(unknown)],
  };
}
