import { seedCourse, type Course } from '@linguapop/content';

/**
 * Un curso de prueba con la misma estructura que el real, pero cuyas lecciones solo usan los tipos
 * de ejercicio que la pantalla ya soporta (elegir, ordenar y escribir). `ids` fija los ejercicios
 * de la primera lección de Saludos; las demás lecciones se dejan como están.
 */
export function cursoConLeccion(ids: readonly string[]): Course {
  return {
    ...seedCourse,
    units: seedCourse.units.map((u, i) =>
      i === 0
        ? {
            ...u,
            lessons: u.lessons.map((l, j) => (j === 0 ? { ...l, exerciseIds: [...ids] } : l)),
          }
        : u,
    ),
  };
}

/** Ejercicios de Saludos por tipo, en el orden del contenido: elegir, ordenar y escribir. */
export const SALUDOS = {
  mc: ['u-saludos-e01', 'u-saludos-e05', 'u-saludos-e10'],
  order: ['u-saludos-e02', 'u-saludos-e07'],
  write: ['u-saludos-e03', 'u-saludos-e09'],
} as const;
