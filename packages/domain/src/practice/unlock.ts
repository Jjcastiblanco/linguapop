import type { Unit } from '@linguapop/content';

type UnitShape = Pick<Unit, 'id' | 'lessons'>;

/** Una unidad está completa cuando se hicieron todas sus lecciones. */
export function isUnitComplete(
  unit: UnitShape,
  lessonsDone: Readonly<Record<string, number>>,
): boolean {
  return (lessonsDone[unit.id] ?? 0) >= unit.lessons.length;
}

/** La primera unidad siempre está abierta; las demás, cuando se completó la anterior. */
export function isUnitUnlocked(
  units: readonly UnitShape[],
  lessonsDone: Readonly<Record<string, number>>,
  unitId: string,
): boolean {
  const index = units.findIndex((u) => u.id === unitId);
  if (index < 0) return false;
  if (index === 0) return true;
  return isUnitComplete(units[index - 1]!, lessonsDone);
}

/** Unidad en la que toca estudiar: la primera sin completar, o la última si ya están todas. */
export function currentUnitId(
  units: readonly UnitShape[],
  lessonsDone: Readonly<Record<string, number>>,
): string | undefined {
  return (units.find((u) => !isUnitComplete(u, lessonsDone)) ?? units.at(-1))?.id;
}
