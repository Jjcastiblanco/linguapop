import type { Course, Lesson, Unit } from '@linguapop/content';
import { isUnitComplete, isUnitUnlocked } from '../practice';

/**
 * Estado de una lección en el camino: `done` ya hecha (se puede repetir), `current` la siguiente
 * por hacer y `locked` todavía cerrada.
 */
export type LessonStatus = 'done' | 'current' | 'locked';

/** Estado del cofre de una unidad: cerrado hasta completarla, listo para abrir, o ya abierto. */
export type ChestStatus = 'locked' | 'ready' | 'opened';

export type PathLesson = { lesson: Lesson; status: LessonStatus };

export type PathUnit = {
  unit: Unit;
  unlocked: boolean;
  complete: boolean;
  lessons: PathLesson[];
  chest: ChestStatus;
};

/** Lo que se necesita del progreso para dibujar el camino. */
export type PathProgress = {
  lessonsDone: Readonly<Record<string, number>>;
  chestsOpened: readonly string[];
};

/**
 * El camino de aprendizaje: las unidades en orden, con cada lección abierta o cerrada según lo
 * hecho y el cofre de cada unidad. Una unidad se abre al completar la anterior.
 */
export function learningPath(units: Course['units'], progress: PathProgress): PathUnit[] {
  return units.map((unit) => {
    const unlocked = isUnitUnlocked(units, progress.lessonsDone, unit.id);
    const done = progress.lessonsDone[unit.id] ?? 0;
    const complete = isUnitComplete(unit, progress.lessonsDone);
    const lessons = unit.lessons.map((lesson, i): PathLesson => ({
      lesson,
      status: !unlocked ? 'locked' : i < done ? 'done' : i === done ? 'current' : 'locked',
    }));
    const chest: ChestStatus = progress.chestsOpened.includes(unit.id)
      ? 'opened'
      : unlocked && complete
        ? 'ready'
        : 'locked';
    return { unit, unlocked, complete, lessons, chest };
  });
}

/** Nova solo contesta cuando se terminó la primera unidad. */
export function isNovaUnlocked(
  units: Course['units'],
  lessonsDone: Readonly<Record<string, number>>,
): boolean {
  const first = units[0];
  return first !== undefined && isUnitComplete(first, lessonsDone);
}
