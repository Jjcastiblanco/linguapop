import { CourseSchema, ExerciseSchema, type Course } from './schema';

const KNOWN_TYPES: ReadonlySet<string> = new Set(
  ExerciseSchema.options.map((o) => o.shape.type.value),
);

/** Un ejercicio que esta versión de la app no sabe mostrar y se omitió. */
export type SkippedExercise = { unitId: string; exerciseId: string; type: string };

export type TolerantCourse =
  { ok: true; course: Course; skipped: SkippedExercise[] } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Lee un curso publicado con tolerancia (AD-5): un ejercicio de un tipo que esta versión no conoce
 * se omite (y se devuelve en `skipped` para registrarlo) sin descartar el curso. Lo demás sí se
 * valida a fondo: cualquier otro defecto devuelve `ok: false` y el llamador conserva el anterior.
 */
export function parseCourseTolerant(raw: unknown): TolerantCourse {
  const skipped: SkippedExercise[] = [];
  let candidate: unknown = raw;

  if (isRecord(raw) && Array.isArray(raw.units)) {
    candidate = {
      ...raw,
      units: raw.units.map((unit: unknown) => {
        if (!isRecord(unit) || !Array.isArray(unit.exercises)) return unit;
        const dropped = new Set<string>();
        const exercises = unit.exercises.filter((e: unknown) => {
          if (!isRecord(e) || typeof e.type !== 'string' || KNOWN_TYPES.has(e.type)) return true;
          dropped.add(String(e.id));
          skipped.push({ unitId: String(unit.id), exerciseId: String(e.id), type: e.type });
          return false;
        });
        if (dropped.size === 0) return unit;
        // Las lecciones dejan de listar lo omitido; una lección que se queda sin ejercicios se quita.
        const lessons = Array.isArray(unit.lessons)
          ? unit.lessons
              .map((l: unknown) =>
                isRecord(l) && Array.isArray(l.exerciseIds)
                  ? {
                      ...l,
                      exerciseIds: l.exerciseIds.filter((id: unknown) => !dropped.has(String(id))),
                    }
                  : l,
              )
              .filter(
                (l: unknown) =>
                  !isRecord(l) || !Array.isArray(l.exerciseIds) || l.exerciseIds.length > 0,
              )
          : unit.lessons;
        return { ...unit, exercises, lessons };
      }),
    };
  }

  const parsed = CourseSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'curso inválido' };
  }
  return { ok: true, course: parsed.data, skipped };
}
