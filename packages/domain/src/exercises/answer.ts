import type { Exercise } from '@linguapop/content';

/** Respuesta completa del estudiante a un ejercicio; cada tipo trae lo suyo. */
export type Answer =
  /** Posición elegida dentro de `options` tal como vienen en el contenido (no la mezclada en pantalla). */
  | { type: 'mc'; optionIndex: number }
  /** Palabras en el orden en que las colocó. */
  | { type: 'order'; words: readonly string[] }
  | { type: 'write'; text: string }
  /** Intentos fallidos al emparejar; los pares correctos se validan con `isCorrectPair`. */
  | { type: 'match'; mistakes: number }
  | { type: 'listen'; text: string }
  | { type: 'speak'; heard: readonly string[] }
  /** Sin reconocimiento de voz: escribe la frase (AD-11). */
  | { type: 'speak-typed'; text: string }
  /** El ejercicio de voz se omite (sin micrófono, sin permiso…). */
  | { type: 'speak-skipped' };

export type AnswerResult = {
  ok: boolean;
  /** Lo que habría sido correcto, para mostrarlo si se falló. */
  correctAnswer: string;
  /** Se omitió: no cuenta como acierto ni como fallo. */
  skipped?: boolean;
  /** Acertó con una errata tolerada (una letra de diferencia). */
  typo?: boolean;
  /** Porcentaje de parecido de lo dicho con la frase (ejercicio de hablar con voz). */
  pronunciation?: number;
  /** Lo que se entendió, cuando no alcanzó. */
  heard?: string;
  /** Intentos fallidos al emparejar. */
  mistakes?: number;
  /** Traducción al español de la frase (ejercicio de escuchar). */
  translation?: string;
};

export type ExerciseOf<T extends Exercise['type']> = Extract<Exercise, { type: T }>;
