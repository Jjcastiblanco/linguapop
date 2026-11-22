import type { Unit } from '@linguapop/content';
import { isUnitComplete } from './unlock';

/**
 * La unidad cuya prueba de nivel conviene ofrecer: la primera sin completar, si el estudiante está
 * justo en su límite (no tiene ninguna lección hecha en ella). Eso ocurre al empezar y al cerrar
 * la unidad anterior; a mitad de una unidad no se ofrece nada.
 */
export function placementOffer(
  units: readonly Unit[],
  lessonsDone: Readonly<Record<string, number>>,
): Unit | null {
  const next = units.find((u) => !isUnitComplete(u, lessonsDone));
  return next && (lessonsDone[next.id] ?? 0) === 0 ? next : null;
}
