import { INITIAL_STREAK, type DayKey, type StreakPlan, type StreakState } from '../streak';

/** Prefijo de los ids de ejercicios de palabra suelta (repaso de palabras a mejorar). */
export const WORD_EXERCISE_PREFIX = 'w-';
/** Vidas del plan gratis. */
export const MAX_HEARTS = 5;
/** Meta diaria de XP por defecto. */
export const DEFAULT_DAILY_GOAL_XP = 50;
/** Máximo de errores pendientes de repaso. */
export const MAX_PENDING_ERRORS = 200;
/** Precios de la tienda de gemas. */
export const PRICES = { hearts: 30, streak_shield: 60 } as const;

export type ProgressStats = {
  lessons: number;
  correct: number;
  total: number;
  perfect: number;
  timedBest: number;
  calls: number;
  seconds: number;
  callSeconds: number;
};

export type ProgressSettings = {
  dailyGoalXp: number;
  plan: StreakPlan;
  timeZone: string;
  displayName: string;
};

/** Todo el estado del estudiante; siempre se reconstruye plegando eventos (AD-6). */
export type ProgressState = {
  xp: number;
  gems: number;
  /** Vidas actuales; solo cuentan en el plan gratis. */
  hearts: number;
  /** Día de la última actualización de vidas (se recargan al empezar un día nuevo). */
  heartsDay: DayKey;
  /** Lecciones completadas por id de unidad. */
  lessonsDone: Record<string, number>;
  /** Unidades cuyo cofre ya se abrió. */
  chestsOpened: string[];
  stats: ProgressStats;
  streak: StreakState;
  /** XP ganado por día calendario. */
  xpByDay: Record<DayKey, number>;
  /** Ejercicios fallados pendientes de repaso. */
  errors: string[];
  /** Cuántas veces se falló cada ejercicio. */
  weak: Record<string, number>;
  /** Palabras a mejorar y cuántas veces se fallaron. */
  words: Record<string, number>;
  /** Logros desbloqueados y cuándo (fecha ISO del evento). */
  achievements: Record<string, string>;
  settings: ProgressSettings;
};

export function initialProgress(): ProgressState {
  return {
    xp: 0,
    gems: 50,
    hearts: MAX_HEARTS,
    heartsDay: '',
    lessonsDone: {},
    chestsOpened: [],
    stats: {
      lessons: 0,
      correct: 0,
      total: 0,
      perfect: 0,
      timedBest: 0,
      calls: 0,
      seconds: 0,
      callSeconds: 0,
    },
    streak: INITIAL_STREAK,
    xpByDay: {},
    errors: [],
    weak: {},
    words: {},
    achievements: {},
    settings: {
      dailyGoalXp: DEFAULT_DAILY_GOAL_XP,
      plan: 'pro',
      timeZone: 'UTC',
      displayName: 'Explorador',
    },
  };
}

/** Vidas que tiene el estudiante hoy: se recargan al empezar un día nuevo. */
export function currentHearts(state: ProgressState, today: DayKey): number {
  return state.heartsDay === today ? state.hearts : MAX_HEARTS;
}
