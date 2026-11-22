import type { TextKey } from './es';

/**
 * Instrucciones de los ejercicios en inglés (inmersión gradual): salen en inglés desde la unidad
 * `ENGLISH_INSTRUCTIONS_FROM_UNIT`, con la traducción al español a un toque. La retroalimentación,
 * los menús y las tarjetas siguen en español.
 */
export const INSTRUCTION_KEYS = [
  'lesson.hint.mc',
  'lesson.hint.order',
  'lesson.hint.write',
  'lesson.hint.match',
  'lesson.hint.listen',
  'lesson.hint.speak',
  'match.title',
  'listen.title',
  'speak.title',
] as const satisfies readonly TextKey[];

export type InstructionKey = (typeof INSTRUCTION_KEYS)[number];

export const en: Record<InstructionKey, string> = {
  'lesson.hint.mc': 'Choose the correct translation',
  'lesson.hint.order': 'Tap the words in order',
  'lesson.hint.write': 'Write in English',
  'lesson.hint.match': 'Match each word with its translation',
  'lesson.hint.listen': 'Listen and write what you hear',
  'lesson.hint.speak': 'Say the sentence out loud',
  'match.title': 'Match the pairs',
  'listen.title': 'What does it say?',
  'speak.title': 'Repeat this sentence',
};

/** Número de unidad (desde 1) desde el que las instrucciones salen en inglés: la 1 queda en español. */
export const ENGLISH_INSTRUCTIONS_FROM_UNIT = 2;

/**
 * ¿Salen en inglés las instrucciones de este ejercicio? Se sabe por el id (`<unidad>-eNN`); los
 * ejercicios que no son de una unidad (palabras sueltas, lecturas) quedan en español.
 */
export function instructionsInEnglish(
  units: readonly { id: string }[],
  exerciseId: string,
): boolean {
  const index = units.findIndex((u) => exerciseId.startsWith(`${u.id}-`));
  return index >= ENGLISH_INSTRUCTIONS_FROM_UNIT - 1;
}
