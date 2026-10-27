import type { Exercise, Lesson, Unit } from '@linguapop/content';

/** Ejercicios de una lección, en su orden, sin los retirados ni los ids que ya no existen. */
export function exercisesOfLesson(unit: Unit, lesson: Lesson): Exercise[] {
  const byId = new Map(unit.exercises.map((e) => [e.id, e]));
  return lesson.exerciseIds
    .map((id) => byId.get(id))
    .filter((e): e is Exercise => e !== undefined && !e.retired);
}
