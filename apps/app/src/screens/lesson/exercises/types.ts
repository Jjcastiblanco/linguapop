import type { Answer, AnswerResult } from '@linguapop/domain';

/** Lo que recibe la pantalla de cada tipo de ejercicio. */
export type ExerciseProps<E> = {
  exercise: E;
  /** Ya se comprobó: no se puede cambiar la respuesta. */
  locked: boolean;
  /** Resultado de la comprobación, una vez hecha. */
  result: AnswerResult | null;
  /** Avisa de la respuesta actual, o nulo si todavía no hay nada que comprobar. */
  onAnswer: (answer: Answer | null) => void;
  /** Pide comprobar (por ejemplo, con Enter). */
  onSubmit: () => void;
};
