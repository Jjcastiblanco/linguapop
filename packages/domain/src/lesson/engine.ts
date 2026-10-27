import type { Exercise } from '@linguapop/content';
import type { PendingEvent, SessionMode } from '../events';
import { checkAnswer, type Answer, type AnswerResult } from '../exercises';
import type { SoundEffect } from '../ports';
import { scoreSession, type SessionScore } from '../scoring';
import type { StreakPlan } from '../streak';

export type LessonConfig = {
  mode: SessionMode;
  /** Ejercicios en el orden en que se harán (ya elegidos y, si hace falta, mezclados). */
  exercises: readonly Exercise[];
  unitId?: string;
  lessonId?: string;
  plan: StreakPlan;
  /** Vidas con las que empieza (solo cuentan en el plan gratis). */
  hearts: number;
  /** La lección ya estaba completada antes: da menos recompensa. */
  isReplay?: boolean;
  /** Tiempo límite en segundos (desafío): al agotarse la sesión termina aunque queden ejercicios. */
  timeLimitSec?: number;
};

export type LessonSummary = {
  durationSec: number;
  score: SessionScore;
  outOfHearts: boolean;
};

export type LessonState = {
  config: LessonConfig;
  /** `answering` espera respuesta; `feedback` muestra el resultado; `finished` terminó; `aborted` se abandonó. */
  phase: 'answering' | 'feedback' | 'finished' | 'aborted';
  index: number;
  startedAtMs: number;
  hearts: number;
  correct: number;
  wrong: number;
  answered: number;
  skipped: number;
  outOfHearts: boolean;
  feedback: { exerciseId: string; result: AnswerResult } | null;
  summary: LessonSummary | null;
};

export type LessonInput =
  | { type: 'submit'; answer: Answer; nowMs: number }
  | { type: 'continue'; nowMs: number }
  /** El tiempo avanza (solo importa con límite de tiempo). */
  | { type: 'tick'; nowMs: number }
  | { type: 'abort' };

/** Lo que el motor pide al exterior; el motor no ejecuta nada por sí mismo. */
export type LessonEffect =
  | { kind: 'sound'; sound: SoundEffect }
  | { kind: 'speak'; text: string; rate?: number }
  | { kind: 'record'; event: PendingEvent };

export type LessonStep = { state: LessonState; effects: LessonEffect[] };

export type StartResult =
  ({ ok: true } & LessonStep) | { ok: false; reason: 'no-hearts' | 'empty' };

const unchanged = (state: LessonState): LessonStep => ({ state, effects: [] });

/** Efectos al mostrar un ejercicio: los de escuchar suenan solos. */
function enter(exercise: Exercise | undefined): LessonEffect[] {
  return exercise?.type === 'listen' ? [{ kind: 'speak', text: exercise.en, rate: 1 }] : [];
}

/** Empieza una sesión. No empieza sin ejercicios, ni en el plan gratis sin vidas. */
export function startLesson(config: LessonConfig, nowMs: number): StartResult {
  if (config.exercises.length === 0) return { ok: false, reason: 'empty' };
  if (config.plan === 'free' && config.hearts <= 0) return { ok: false, reason: 'no-hearts' };
  const state: LessonState = {
    config,
    phase: 'answering',
    index: 0,
    startedAtMs: nowMs,
    hearts: config.hearts,
    correct: 0,
    wrong: 0,
    answered: 0,
    skipped: 0,
    outOfHearts: false,
    feedback: null,
    summary: null,
  };
  return { ok: true, state, effects: enter(config.exercises[0]) };
}

/** Ejercicio que se está mostrando, si la sesión sigue en curso. */
export function currentExercise(state: LessonState): Exercise | undefined {
  return state.phase === 'answering' || state.phase === 'feedback'
    ? state.config.exercises[state.index]
    : undefined;
}

/** Segundos que quedan con límite de tiempo (nunca menos de 0); nulo si la sesión no tiene límite. */
export function remainingSec(state: LessonState, nowMs: number): number | null {
  const limit = state.config.timeLimitSec;
  if (limit === undefined) return null;
  return Math.max(0, Math.ceil((state.startedAtMs + limit * 1000 - nowMs) / 1000));
}

/** Avance de 0 a 1 para la barra de progreso (cuenta el ejercicio respondido). */
export function lessonProgress(state: LessonState): number {
  const total = state.config.exercises.length;
  if (state.phase === 'finished') return 1;
  return Math.min(1, (state.index + (state.phase === 'feedback' ? 1 : 0)) / total);
}

function submit(state: LessonState, answer: Answer): LessonStep {
  const exercise = state.config.exercises[state.index];
  if (state.phase !== 'answering' || !exercise) return unchanged(state);
  const result = checkAnswer(exercise, answer);
  const effects: LessonEffect[] = [];
  const next: LessonState = {
    ...state,
    phase: 'feedback',
    feedback: { exerciseId: exercise.id, result },
  };

  if (result.skipped) {
    next.skipped += 1;
  } else {
    next.answered += 1;
    if (result.ok) {
      next.correct += 1;
      effects.push({ kind: 'sound', sound: 'ok' });
      if (exercise.type === 'order' || exercise.type === 'write') {
        effects.push({ kind: 'speak', text: exercise.en });
      }
    } else {
      next.wrong += 1;
      effects.push({ kind: 'sound', sound: 'bad' });
      if (state.config.plan === 'free' && state.config.mode !== 'timed') {
        next.hearts = Math.max(0, state.hearts - 1);
        if (next.hearts <= 0) next.outOfHearts = true;
      }
    }
  }
  effects.push({
    kind: 'record',
    event: {
      type: 'exercise_answered@1',
      payload: {
        exerciseId: exercise.id,
        correct: result.ok,
        mode: state.config.mode,
        ...(result.skipped ? { skipped: true } : {}),
      },
    },
  });
  return { state: next, effects };
}

function finish(state: LessonState, nowMs: number): LessonStep {
  const { config } = state;
  const durationSec = Math.max(1, Math.round((nowMs - state.startedAtMs) / 1000));
  const score = scoreSession({
    mode: config.mode,
    correct: state.correct,
    wrong: state.wrong,
    answered: state.answered,
    outOfHearts: state.outOfHearts,
    isReplay: config.isReplay ?? false,
  });
  return {
    state: {
      ...state,
      phase: 'finished',
      summary: { durationSec, score, outOfHearts: state.outOfHearts },
    },
    effects: [
      { kind: 'sound', sound: state.outOfHearts ? 'bad' : 'win' },
      {
        kind: 'record',
        event: {
          type: 'session_completed@1',
          payload: {
            mode: config.mode,
            ...(config.unitId ? { unitId: config.unitId } : {}),
            ...(config.lessonId ? { lessonId: config.lessonId } : {}),
            correct: state.correct,
            wrong: state.wrong,
            answered: state.answered,
            durationSec,
            outOfHearts: state.outOfHearts,
          },
        },
      },
    ],
  };
}

function advance(state: LessonState, nowMs: number): LessonStep {
  if (state.phase !== 'feedback') return unchanged(state);
  const nextIndex = state.index + 1;
  if (state.outOfHearts || nextIndex >= state.config.exercises.length) return finish(state, nowMs);
  return {
    state: { ...state, phase: 'answering', index: nextIndex, feedback: null },
    effects: enter(state.config.exercises[nextIndex]),
  };
}

/**
 * Máquina pura de la sesión: recibe una entrada y devuelve el nuevo estado y los efectos.
 * Una entrada que no corresponde a la fase actual se ignora (nunca lanza).
 */
export function stepLesson(state: LessonState, input: LessonInput): LessonStep {
  if (state.phase === 'finished' || state.phase === 'aborted') return unchanged(state);
  switch (input.type) {
    case 'submit':
      return submit(state, input.answer);
    case 'continue':
      return advance(state, input.nowMs);
    case 'tick':
      return remainingSec(state, input.nowMs) === 0 ? finish(state, input.nowMs) : unchanged(state);
    case 'abort':
      return { state: { ...state, phase: 'aborted' }, effects: [] };
  }
}
