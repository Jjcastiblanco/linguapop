import type { SessionMode } from '../events';

/** Gemas extra por desbloquear un logro. */
export const ACHIEVEMENT_GEM_BONUS = 5;
/** Gemas extra por cruzar la meta diaria de XP. */
export const DAILY_GOAL_GEM_BONUS = 10;
/** Porcentaje mínimo de aciertos para aprobar una prueba de nivel. */
export const PLACEMENT_PASS_PERCENT = 80;

export type SessionScoreInput = {
  mode: SessionMode;
  correct: number;
  wrong: number;
  answered: number;
  /** El estudiante se quedó sin vidas (plan gratis). */
  outOfHearts: boolean;
  /** Solo en modo lección: la lección ya estaba completada antes. */
  isReplay?: boolean;
};

export type SessionScore = {
  xp: number;
  gems: number;
  /** Porcentaje entero de aciertos sobre lo respondido (0 si no se respondió nada). */
  accuracy: number;
  /** Sin errores, con respuestas, sin quedarse sin vidas y fuera del desafío. */
  perfect: boolean;
  /** Resultado de una prueba de nivel; nulo en otros modos o si se quedó sin vidas. */
  passed: boolean | null;
};

/** Premio (XP y gemas) de una sesión terminada. No incluye bonos por logros ni por meta diaria. */
export function scoreSession(input: SessionScoreInput): SessionScore {
  const { mode, correct, wrong, answered, outOfHearts } = input;
  const accuracy = answered > 0 ? Math.round((100 * correct) / answered) : 0;
  const perfect = wrong === 0 && answered > 0 && !outOfHearts && mode !== 'timed';
  let xp = 0;
  let gems = 0;
  let passed: boolean | null = null;

  if (outOfHearts) {
    xp = correct * 2;
  } else if (mode === 'lesson') {
    xp = correct * 10 + (perfect ? 20 : 0);
    gems = perfect ? 10 : 5;
    if (input.isReplay) {
      xp = Math.round(xp / 2);
      gems = 0;
    }
  } else if (mode === 'review' || mode === 'practice') {
    xp = correct * 5;
    gems = 2;
  } else if (mode === 'timed') {
    xp = correct * 5;
    gems = Math.floor(correct / 3);
  } else if (mode === 'test') {
    passed = accuracy >= PLACEMENT_PASS_PERCENT;
    if (passed) {
      xp = 40;
      gems = 25;
    }
  }
  return { xp, gems, accuracy, perfect, passed };
}

/** Gemas de bono si esta ganancia de XP hace cruzar la meta diaria (solo la primera vez en el día). */
export function dailyGoalBonus(xpToday: number, earned: number, goal: number): number {
  return xpToday < goal && xpToday + earned >= goal ? DAILY_GOAL_GEM_BONUS : 0;
}
