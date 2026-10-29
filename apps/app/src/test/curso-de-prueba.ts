import { seedCourse, type Course, type TeachCard } from '@linguapop/content';

/**
 * Un curso de prueba con la misma estructura que el real, pero cuyas lecciones solo usan los tipos
 * de ejercicio que la pantalla ya soporta (elegir, ordenar y escribir). `ids` fija los ejercicios
 * de la primera lección de Saludos; las demás lecciones se dejan como están. La primera lección
 * no trae «Palabras nuevas» salvo que se pasen `teach`, para que las pruebas entren directo al ejercicio.
 */
export function cursoConLeccion(ids: readonly string[], teach?: readonly TeachCard[]): Course {
  return {
    ...seedCourse,
    units: seedCourse.units.map((u, i) =>
      i === 0
        ? {
            ...u,
            lessons: u.lessons.map((l, j) => {
              if (j !== 0) return l;
              const { teach: _semilla, ...sinTeach } = l;
              return {
                ...sinTeach,
                exerciseIds: [...ids],
                ...(teach ? { teach: [...teach] } : {}),
              };
            }),
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
