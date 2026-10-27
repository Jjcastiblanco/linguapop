import { daysBetween, monthKey, type DayKey } from './day';

export type StreakPlan = 'free' | 'pro';

export type StreakState = {
  streak: number;
  best: number;
  /** Último día con actividad; cadena vacía si nunca hubo. */
  lastDay: DayKey;
  /** Mes (`AAAA-MM`) en que se usó el protector; cadena vacía si nunca. */
  shieldMonth: string;
};

export const INITIAL_STREAK: StreakState = { streak: 0, best: 0, lastDay: '', shieldMonth: '' };

/** El protector mensual existe solo en el plan PRO y se usa una vez por mes. */
function shieldAvailable(state: StreakState, today: DayKey, plan: StreakPlan): boolean {
  return plan === 'pro' && state.shieldMonth !== monthKey(today);
}

/** Racha que se muestra hoy: se pierde si pasó más de un día sin actividad (salvo protector). */
export function visibleStreak(state: StreakState, today: DayKey, plan: StreakPlan): number {
  if (!state.lastDay) return 0;
  const gap = daysBetween(state.lastDay, today);
  if (gap === null) return 0;
  if (gap <= 1) return state.streak;
  if (gap === 2 && shieldAvailable(state, today, plan)) return state.streak;
  return 0;
}

/** Registra actividad en `today`: suma, mantiene (con protector) o reinicia la racha. */
export function registerActivity(
  state: StreakState,
  today: DayKey,
  plan: StreakPlan,
): { state: StreakState; shieldUsed: boolean } {
  if (state.lastDay === today) return { state, shieldUsed: false };
  let { streak, shieldMonth } = state;
  let shieldUsed = false;
  const gap = state.lastDay ? daysBetween(state.lastDay, today) : null;
  if (!state.lastDay || gap === null) {
    streak = 1;
  } else if (gap === 1) {
    streak += 1;
  } else if (gap === 2 && shieldAvailable(state, today, plan)) {
    shieldMonth = monthKey(today);
    streak += 1;
    shieldUsed = true;
  } else {
    streak = 1;
  }
  return {
    state: { streak, best: Math.max(state.best, streak), lastDay: today, shieldMonth },
    shieldUsed,
  };
}
