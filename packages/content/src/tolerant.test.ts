import { describe, expect, it } from 'vitest';
import { seedCourse } from './seed';
import { parseCourseTolerant } from './tolerant';

const copia = () => JSON.parse(JSON.stringify(seedCourse)) as unknown as Record<string, any>;

describe('lectura tolerante del curso', () => {
  it('acepta el curso semilla completo, sin omitir nada', () => {
    const r = parseCourseTolerant(copia());
    expect(r.ok && r.skipped).toEqual([]);
    expect(r.ok && r.course.units).toHaveLength(seedCourse.units.length);
  });

  it('omite un ejercicio de tipo desconocido, lo informa y conserva el resto', () => {
    const raw = copia();
    const unidad = raw.units[0];
    const nuevo = { id: `${unidad.id}-futuro`, type: 'hologram', prompt: 'x' };
    unidad.exercises.push(nuevo);
    unidad.lessons[0].exerciseIds.push(nuevo.id);
    const r = parseCourseTolerant(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toEqual([{ unitId: unidad.id, exerciseId: nuevo.id, type: 'hologram' }]);
    expect(r.course.units[0]!.exercises.some((e) => e.id === nuevo.id)).toBe(false);
    expect(r.course.units[0]!.lessons[0]!.exerciseIds).not.toContain(nuevo.id);
    expect(r.course.units[0]!.exercises).toHaveLength(seedCourse.units[0]!.exercises.length);
  });

  it('quita la lección que se queda sin ejercicios', () => {
    const raw = copia();
    const unidad = raw.units[0];
    unidad.exercises = unidad.exercises.map((e: any) =>
      unidad.lessons[0].exerciseIds.includes(e.id) ? { ...e, type: 'hologram' } : e,
    );
    const r = parseCourseTolerant(raw);
    // Quedan ≥ 15 ejercicios solo si la unidad tenía de sobra; si no, el curso se descarta entero.
    if (r.ok)
      expect(r.course.units[0]!.lessons.length).toBe(seedCourse.units[0]!.lessons.length - 1);
    else expect(r.error).toMatch(/ejercicios/);
  });

  it.each([
    ['nada', null],
    ['texto', 'hola'],
    [
      'sin unidades',
      {
        schemaVersion: 1,
        from: 'es',
        to: 'en',
        level: 'A1',
        units: [],
        dialogues: [],
        achievements: [],
      },
    ],
    ['versión de esquema nueva', { ...JSON.parse(JSON.stringify(seedCourse)), schemaVersion: 2 }],
  ])('descarta un curso inválido: %s', (_caso, raw) => {
    expect(parseCourseTolerant(raw).ok).toBe(false);
  });

  it('descarta el curso si un ejercicio conocido está mal formado', () => {
    const raw = copia();
    raw.units[0].exercises[0] = { ...raw.units[0].exercises[0], prompt: '' };
    expect(parseCourseTolerant(raw).ok).toBe(false);
  });
});
