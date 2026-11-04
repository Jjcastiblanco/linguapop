import type { Exercise } from '@linguapop/content';
import { levenshtein, normalizeText, similarity } from '../text';
import type { Answer, AnswerResult, ExerciseOf } from './answer';

/** Cuántos intentos fallidos admite emparejar y aun así cuenta como acierto. */
export const MATCH_MAX_MISTAKES = 2;
/** Una errata solo se tolera en respuestas de más de 5 letras y, dentro de ellas, en palabras de 4 o más (`TYPO_MIN_WORD_LENGTH`). */
export const TYPO_MIN_LENGTH = 6;
/** Una errata tolerada es una sola letra de diferencia. */
export const TYPO_MAX_DISTANCE = 1;
/** La palabra donde cae la errata tiene al menos 4 letras: en una más corta una letra ya es otra palabra. */
export const TYPO_MIN_WORD_LENGTH = 4;
/** Parecido mínimo (0 a 1) para dar por buena una frase dicha con voz. */
export const SPEAK_PASS_SIMILARITY = 0.72;
/** Parecido mínimo (0 a 1) cuando la frase se escribe en lugar de decirla. */
export const SPEAK_TYPED_PASS_SIMILARITY = 0.9;

/** La respuesta correcta tal como se muestra al estudiante. */
export function correctAnswerOf(exercise: Exercise): string {
  switch (exercise.type) {
    case 'mc':
      return exercise.options[exercise.answerIndex]?.text ?? '';
    case 'match':
      return exercise.pairs.map((p) => `${p.es} = ${p.en}`).join(' · ');
    default:
      return exercise.en;
  }
}

/** ¿Es correcta esta pareja (español, inglés) dentro de un ejercicio de emparejar? */
export function isCorrectPair(exercise: ExerciseOf<'match'>, es: string, en: string): boolean {
  return exercise.pairs.some((p) => p.es === es && p.en === en);
}

/**
 * ¿Es `given` una errata de `target` (ya normalizados)? Una letra de diferencia dentro de una
 * palabra de 4 letras o más, o un espacio de más o de menos. Cambiar una palabra corta por otra
 * («he» por «she», «cat» por «car») no es una errata.
 */
function isTypoOf(given: string, target: string): boolean {
  if (levenshtein(given, target) > TYPO_MAX_DISTANCE) return false;
  const g = given.split(' ');
  const t = target.split(' ');
  if (g.length !== t.length) return g.join('') === t.join('');
  const i = g.findIndex((word, k) => word !== t[k]);
  return i >= 0 && (t[i]?.length ?? 0) >= TYPO_MIN_WORD_LENGTH;
}

/** Igual al objetivo, o con una errata si la frase es lo bastante larga. Devuelve si hubo errata. */
function compareTolerant(text: string, targets: readonly string[]): { ok: boolean; typo: boolean } {
  const given = normalizeText(text);
  const normalizedTargets = targets.map(normalizeText);
  if (normalizedTargets.includes(given)) return { ok: true, typo: false };
  const near = given.length >= TYPO_MIN_LENGTH && normalizedTargets.some((t) => isTypoOf(given, t));
  return { ok: near, typo: near };
}

function checkMultipleChoice(e: ExerciseOf<'mc'>, optionIndex: number): AnswerResult {
  return { ok: optionIndex === e.answerIndex, correctAnswer: correctAnswerOf(e) };
}

function checkOrder(e: ExerciseOf<'order'>, words: readonly string[]): AnswerResult {
  const ok = normalizeText(words.join(' ')) === normalizeText(e.en);
  return { ok, correctAnswer: e.en };
}

function checkWrite(e: ExerciseOf<'write'>, text: string): AnswerResult {
  const { ok, typo } = compareTolerant(text, [e.en, ...e.alternatives]);
  return { ok, correctAnswer: e.en, ...(typo ? { typo } : {}) };
}

function checkMatch(e: ExerciseOf<'match'>, mistakes: number): AnswerResult {
  return {
    ok: mistakes <= MATCH_MAX_MISTAKES,
    correctAnswer: correctAnswerOf(e),
    ...(mistakes > 0 ? { mistakes } : {}),
  };
}

function checkListen(e: ExerciseOf<'listen'>, text: string): AnswerResult {
  const { ok, typo } = compareTolerant(text, [e.en]);
  return { ok, correctAnswer: e.en, translation: e.es, ...(typo ? { typo } : {}) };
}

function checkSpeak(e: ExerciseOf<'speak'>, heard: readonly string[]): AnswerResult {
  const best = Math.max(0, ...heard.map((h) => similarity(h, e.en)));
  const ok = best >= SPEAK_PASS_SIMILARITY;
  return {
    ok,
    correctAnswer: e.en,
    ...(ok ? { pronunciation: Math.round(best * 100) } : heard[0] ? { heard: heard[0] } : {}),
  };
}

/**
 * Comprueba la respuesta a un ejercicio. Si el tipo de la respuesta no corresponde al del
 * ejercicio no acierta (nunca lanza): la interfaz es la que debe enviar el tipo correcto.
 */
export function checkAnswer(exercise: Exercise, answer: Answer): AnswerResult {
  const wrong: AnswerResult = { ok: false, correctAnswer: correctAnswerOf(exercise) };
  switch (exercise.type) {
    case 'mc':
      return answer.type === 'mc' ? checkMultipleChoice(exercise, answer.optionIndex) : wrong;
    case 'order':
      return answer.type === 'order' ? checkOrder(exercise, answer.words) : wrong;
    case 'write':
      return answer.type === 'write' ? checkWrite(exercise, answer.text) : wrong;
    case 'match':
      return answer.type === 'match' ? checkMatch(exercise, answer.mistakes) : wrong;
    case 'listen':
      return answer.type === 'listen' ? checkListen(exercise, answer.text) : wrong;
    case 'speak':
      if (answer.type === 'speak') return checkSpeak(exercise, answer.heard);
      if (answer.type === 'speak-skipped')
        return { ok: true, skipped: true, correctAnswer: exercise.en };
      if (answer.type === 'speak-typed') {
        const ok = similarity(answer.text, exercise.en) >= SPEAK_TYPED_PASS_SIMILARITY;
        return { ok, correctAnswer: exercise.en };
      }
      return wrong;
  }
}
