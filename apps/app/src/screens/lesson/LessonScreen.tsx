import { taughtThrough } from '@linguapop/content';
import { currentHearts, dayKey, exercisesOfLesson } from '@linguapop/domain';
import { useEffect, useMemo } from 'react';
import { Navigate, useParams } from 'react-router';
import { useProgress, useServices } from '../../composition/context';
import { SessionView } from './SessionView';

/** Pantalla de lección: arma la sesión de la lección de la ruta y la muestra con `SessionView`. */
export function LessonScreen() {
  const { unitId, lessonId } = useParams();
  const { composition, lesson: sessionStore } = useServices();
  const progress = useProgress((s) => s.progress);

  const unit = composition.course.units.find((u) => u.id === unitId);
  const lessonDef = unit?.lessons.find((l) => l.id === lessonId);
  const exercises = useMemo(
    () => (unit && lessonDef ? exercisesOfLesson(unit, lessonDef) : []),
    [unit, lessonDef],
  );

  // Se empieza una sola vez al abrir la pantalla; al salir se cierra la sesión.
  useEffect(() => {
    if (!unit || !lessonDef || exercises.length === 0) return;
    const state = sessionStore.getState();
    const today = dayKey(composition.clock.now(), progress.settings.timeZone);
    const done = progress.lessonsDone[unit.id] ?? 0;
    state.start({
      mode: 'lesson',
      exercises,
      unitId: unit.id,
      lessonId: lessonDef.id,
      plan: progress.settings.plan,
      hearts: currentHearts(progress, today),
      isReplay: unit.lessons.indexOf(lessonDef) < done,
    });
    return () => sessionStore.getState().clear();
    // La sesión se arma con el progreso del momento de abrir; no debe reiniciarse al registrar eventos.
  }, [unit, lessonDef, exercises]);

  if (!unit || !lessonDef || exercises.length === 0) return <Navigate to="/aprender" replace />;
  return (
    <SessionView
      unit={unit}
      exitTo="/aprender"
      teach={lessonDef.teach}
      glossary={taughtThrough(composition.course.units, lessonDef.id)}
    />
  );
}
