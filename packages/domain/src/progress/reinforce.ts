import type { Course, Exercise } from '@linguapop/content';
import { isUnitUnlocked } from '../practice/unlock';
import { skillOf, type Skill } from './mastery';
import { RETENTION7_MIN, type ProgressState } from './state';

/** Supuestos sin evidencia: se ajustan con datos reales. */
export const RETENTION_LOW_PERCENT = 60;
export const SKILL_ERRORS_MIN = 5;

export type ReinforceReason = { reason: 'retention' } | { reason: 'skill'; skill: Skill };

/** Ejercicios del curso que cuentan: no retirados y de unidades abiertas. */
export function openExerciseIndex(
  units: Course['units'],
  lessonsDone: Readonly<Record<string, number>>,
): Map<string, Exercise> {
  const index = new Map<string, Exercise>();
  for (const u of units) {
    if (!isUnitUnlocked(units, lessonsDone, u.id)) continue;
    for (const e of u.exercises) if (!e.retired) index.set(e.id, e);
  }
  return index;
}

/**
 * ¿Hace falta reforzar? Gana la retención a 7 días baja (con al menos `RETENTION7_MIN` resultados y algo que reforzar);
 * si no, la habilidad con más errores pendientes (desde `SKILL_ERRORS_MIN`). Puro.
 */
export function reinforcementNeeded(
  units: Course['units'],
  progress: Pick<ProgressState, 'errors' | 'weak' | 'retention7' | 'lessonsDone'>,
): ReinforceReason | null {
  const index = openExerciseIndex(units, progress.lessonsDone);
  const results = progress.retention7;
  if (results.length >= RETENTION7_MIN) {
    const percent = (100 * results.filter(Boolean).length) / results.length;
    // Solo se ofrece si hay algo que reforzar: sin errores ni fallos en unidades abiertas la tarjeta no haría nada.
    const hasItems = [...progress.errors, ...Object.keys(progress.weak)].some((id) =>
      index.has(id),
    );
    if (percent < RETENTION_LOW_PERCENT && hasItems) return { reason: 'retention' };
  }
  const counts = new Map<Skill, number>();
  for (const id of new Set(progress.errors)) {
    const e = index.get(id);
    if (e) counts.set(skillOf(e.type), (counts.get(skillOf(e.type)) ?? 0) + 1);
  }
  let best: { skill: Skill; n: number } | null = null;
  for (const [skill, n] of counts)
    if (n >= SKILL_ERRORS_MIN && (!best || n > best.n)) best = { skill, n };
  return best ? { reason: 'skill', skill: best.skill } : null;
}
