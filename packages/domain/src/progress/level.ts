import type { Unit } from '@linguapop/content';
import { isUnitComplete } from '../practice/unlock';

type UnitShape = Pick<Unit, 'id' | 'lessons'>;

/**
 * Supuesto: el contenido no está etiquetado por nivel, así que las primeras 3 unidades cuentan como
 * A1 y las siguientes como A2. Cambiarlo cuando el contenido traiga su nivel.
 */
export const A1_UNITS = 3;

export type EstimatedLevel = 'start' | 'a1-progress' | 'a1' | 'a2-progress' | 'a2';

/**
 * Nivel estimado a partir de lo completado (jugando o por prueba de nivel). Es una estimación, no
 * una medición validada del MCER.
 */
export function estimatedLevel(
  units: readonly UnitShape[],
  lessonsDone: Readonly<Record<string, number>>,
): EstimatedLevel {
  const a1 = units.slice(0, A1_UNITS);
  const a2 = units.slice(A1_UNITS);
  const started = (list: readonly UnitShape[]) => list.some((u) => (lessonsDone[u.id] ?? 0) > 0);
  const complete = (list: readonly UnitShape[]) =>
    list.every((u) => isUnitComplete(u, lessonsDone));

  if (!started(units)) return 'start';
  if (!complete(a1)) return 'a1-progress';
  if (a2.length === 0) return 'a1';
  if (complete(a2)) return 'a2';
  return started(a2) ? 'a2-progress' : 'a1';
}
