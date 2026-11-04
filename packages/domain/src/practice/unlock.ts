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

/**
 * La regla única para jugar una lección: la unidad anterior está completa y la lección no pasa de
 * la siguiente por hacer. La usan la pantalla (`isLessonUnlocked`) y el pliegue de eventos.
 */
export function canPlayLesson(
  lessonIndex: number,
  lessonsDone: number,
  previousUnitComplete: boolean,
): boolean {
  return lessonIndex >= 0 && previousUnitComplete && lessonIndex <= lessonsDone;
}

/** Una lección se puede abrir si su unidad está abierta y no está más allá de la siguiente por hacer. */
export function isLessonUnlocked(
  units: readonly UnitShape[],
  lessonsDone: Readonly<Record<string, number>>,
  unitId: string,
  lessonId: string,
): boolean {
  const unit = units.find((u) => u.id === unitId);
  const index = unit?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  if (!unit) return false;
  return canPlayLesson(index, lessonsDone[unitId] ?? 0, isUnitUnlocked(units, lessonsDone, unitId));
}

/** Unidad en la que toca estudiar: la primera sin completar, o la última si ya están todas. */
export function currentUnitId(
  units: readonly UnitShape[],
  lessonsDone: Readonly<Record<string, number>>,
): string | undefined {
  return (units.find((u) => !isUnitComplete(u, lessonsDone)) ?? units.at(-1))?.id;
}
