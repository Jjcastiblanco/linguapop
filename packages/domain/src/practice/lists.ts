import type { Course, Exercise } from '@linguapop/content';
import {
  WORD_EXERCISE_PREFIX,
  openExerciseIndex,
  skillOf,
  type ProgressState,
  type ReinforceReason,
  type Skill,
} from '../progress';
import type { Random } from '../ports';
import type { DayKey } from '../streak';
import { shuffle } from '../random';
import { isUnitUnlocked } from './unlock';

export type PracticeInput = {
  units: Course['units'];
  progress: Pick<ProgressState, 'errors' | 'weak' | 'words' | 'lessonsDone' | 'reviews'>;
  random: Random;
};

/** Cuántos ejercicios arma cada modo (reglas de la versión heredada). */
export const REVIEW_SIZE = 12;
export const DAILY_REVIEW_SIZE = 12;
export const PERSONALIZED_SIZE = 10;
export const PERSONALIZED_WEAK_MAX = 10;
export const PERSONALIZED_WORDS_MAX = 3;
export const TIMED_SIZE = 40;
export const TIMED_SECONDS = 90;
export const PLACEMENT_SIZE = 12;
export const REINFORCE_SIZE = 12;

const WORD_TIP = 'Palabra que te costó en una llamada con Nova.';

/** Ejercicios de una palabra a mejorar: decirla y escucharla. Comparten el id `w-palabra`. */
function wordExercise(word: string, type: 'speak' | 'listen', es: string): Exercise {
  return { id: `${WORD_EXERCISE_PREFIX}${word}`, type, en: word, es, tip: WORD_TIP };
}

function exerciseIndex(units: Course['units']): Map<string, Exercise> {
  const index = new Map<string, Exercise>();
  for (const u of units) for (const e of u.exercises) if (!e.retired) index.set(e.id, e);
  return index;
}

/** Ejercicios de las unidades abiertas que no se han descartado. */
function unlockedExercises(input: PracticeInput): Exercise[] {
  return input.units.flatMap((u) =>
    isUnitUnlocked(input.units, input.progress.lessonsDone, u.id)
      ? u.exercises.filter((e) => !e.retired)
      : [],
  );
}

const RECALL_PROMPT = /^¿Cómo se dice "(.+)"\?$/;

/** En el repaso se recuerda en vez de reconocer: «¿Cómo se dice "X"?» se escribe, sin opciones. */
export function toRecallExercise(e: Exercise): Exercise {
  if (e.type !== 'mc') return e;
  const es = RECALL_PROMPT.exec(e.prompt.trim())?.[1];
  const answer = e.options[e.answerIndex]?.text;
  if (!es || !answer) return e;
  const recall: Exercise = { id: e.id, type: 'write', es, en: answer, alternatives: [] };
  if (e.tip !== undefined) recall.tip = e.tip;
  return recall;
}

/** Emparejar (solo reconocer) va al final de la sesión; el resto conserva su orden. */
export function recognitionLast(list: Exercise[]): Exercise[] {
  return [...list.filter((e) => e.type !== 'match'), ...list.filter((e) => e.type === 'match')];
}

const forRecall = (list: Exercise[]): Exercise[] => recognitionLast(list.map(toRecallExercise));

/** Repaso de errores: los ejercicios fallados y las palabras a mejorar, mezclados. */
export function buildReviewList(input: PracticeInput): Exercise[] {
  const index = exerciseIndex(input.units);
  const items: Exercise[] = [];
  for (const id of input.progress.errors) {
    const e = index.get(id);
    if (e) items.push(e);
  }
  for (const word of Object.keys(input.progress.words)) {
    items.push(wordExercise(word, 'speak', 'Palabra para mejorar'));
    items.push(wordExercise(word, 'listen', 'Palabra para mejorar'));
  }
  return forRecall(shuffle(items, input.random).slice(0, REVIEW_SIZE));
}

/** Refuerzo: errores y los de más fallos de unidades abiertas (de la habilidad si el motivo lo es), hasta 12. */
export function buildReinforceList(
  input: PracticeInput,
  reason: ReinforceReason['reason'],
  skill?: Skill,
): Exercise[] {
  const index = openExerciseIndex(input.units, input.progress.lessonsDone);
  const weakIds = Object.entries(input.progress.weak)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const seen = new Set<string>();
  const items: Exercise[] = [];
  for (const id of [...input.progress.errors, ...weakIds]) {
    const e = index.get(id);
    if (!e || seen.has(id)) continue;
    if (reason === 'skill' && skill && skillOf(e.type) !== skill) continue;
    seen.add(id);
    items.push(e);
  }
  return forRecall(items.slice(0, REINFORCE_SIZE));
}

/** Ejercicios vencidos (hoy o antes) de unidades abiertas, del vencimiento más antiguo al más nuevo. */
function dueExercises(input: PracticeInput, today: DayKey): Exercise[] {
  const index = exerciseIndex(input.units);
  const open = new Set(unlockedExercises(input).map((e) => e.id));
  return Object.entries(input.progress.reviews)
    .filter(([id, slot]) => slot.due <= today && open.has(id) && index.has(id))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[0] < b[0] ? -1 : 1))
    .map(([id]) => index.get(id)!);
}

/** «Repaso de hoy»: lo vencido, lo más atrasado primero. */
export function buildDailyReviewList(input: PracticeInput, today: DayKey): Exercise[] {
  return forRecall(dueExercises(input, today).slice(0, DAILY_REVIEW_SIZE));
}

/** Cuántos ejercicios vencidos hay en total (el contador de la tarjeta). */
export function dailyReviewCount(input: PracticeInput, today: DayKey): number {
  return dueExercises(input, today).length;
}

/** Práctica personalizada: lo más débil primero y, si sobra sitio, ejercicios de las unidades abiertas. */
export function buildPersonalizedList(input: PracticeInput): Exercise[] {
  const index = exerciseIndex(input.units);
  const weakest = Object.entries(input.progress.weak)
    .sort((a, b) => b[1] - a[1])
    .slice(0, PERSONALIZED_WEAK_MAX)
    .map(([id]) => index.get(id))
    .filter((e): e is Exercise => e !== undefined);
  const words = Object.keys(input.progress.words)
    .slice(0, PERSONALIZED_WORDS_MAX)
    .map((w) => wordExercise(w, 'speak', 'Palabra débil'));
  const chosen = [...weakest, ...words];
  const used = new Set(chosen.map((e) => e.id));
  const pool = unlockedExercises(input).filter((e) => !used.has(e.id));
  const list = [...chosen, ...shuffle(pool, input.random)].slice(0, PERSONALIZED_SIZE);
  return shuffle(list, input.random);
}

/** Desafío cronometrado: ejercicios rápidos (sin emparejar ni hablar) de las unidades abiertas. */
export function buildTimedList(input: PracticeInput): Exercise[] {
  const quick = unlockedExercises(input).filter((e) =>
    ['mc', 'write', 'order', 'listen'].includes(e.type),
  );
  return shuffle(quick, input.random).slice(0, TIMED_SIZE);
}

/** Prueba de nivel de una unidad: sin ejercicios de hablar. */
export function buildPlacementList(input: PracticeInput, unitId: string): Exercise[] {
  const unit = input.units.find((u) => u.id === unitId);
  if (!unit) return [];
  const exercises = unit.exercises.filter((e) => e.type !== 'speak' && !e.retired);
  return shuffle(exercises, input.random).slice(0, PLACEMENT_SIZE);
}
