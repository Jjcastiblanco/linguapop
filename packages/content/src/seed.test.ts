import { describe, expect, it } from 'vitest';
import { CourseSchema } from './schema';
import { seedAchievements, seedCourse, seedDialogues, seedUnits } from './seed';
import { findUntaughtTerms, normalizeTerm } from './teach';

// Fórmula de la versión heredada: 3 lecciones de 10 ejercicios con desfases 0, 7 y 14.
const DESFASES = [0, 7, 14];
const UNIDADES = ['u-saludos', 'u-comida', 'u-familia', 'u-viajes', 'u-trabajo'];

describe('semilla: unidades', () => {
  it('son las 5 unidades de la versión heredada, en orden', () => {
    expect(seedUnits.map((u) => u.id)).toEqual(UNIDADES);
    expect(seedUnits.map((u) => u.name)).toEqual([
      'Saludos',
      'Comida',
      'Familia',
      'Viajes',
      'Trabajo',
    ]);
  });

  it.each(UNIDADES)(
    '%s tiene 20 ejercicios con los seis tipos y la mezcla de la versión heredada',
    (id) => {
      const u = seedUnits.find((x) => x.id === id)!;
      expect(u.exercises).toHaveLength(20);
      const porTipo = (t: string) => u.exercises.filter((e) => e.type === t).length;
      expect({
        mc: porTipo('mc'),
        order: porTipo('order'),
        write: porTipo('write'),
        match: porTipo('match'),
        listen: porTipo('listen'),
        speak: porTipo('speak'),
      }).toEqual({
        mc: 5,
        order: 4,
        write: 4,
        match: 2,
        listen: 3,
        speak: 2,
      });
    },
  );

  it.each(UNIDADES)(
    '%s tiene 3 lecciones de 10 ejercicios iguales a las de la versión heredada',
    (id) => {
      const u = seedUnits.find((x) => x.id === id)!;
      const ids = u.exercises.map((e) => e.id);
      expect(u.lessons.map((l) => l.id)).toEqual([`${id}-l1`, `${id}-l2`, `${id}-l3`]);
      u.lessons.forEach((leccion, j) => {
        const esperado = Array.from({ length: 10 }, (_, n) => ids[(DESFASES[j]! + n) % ids.length]);
        expect(leccion.exerciseIds).toEqual(esperado);
      });
    },
  );

  it('los 100 ejercicios tienen ids distintos', () => {
    const todos = seedUnits.flatMap((u) => u.exercises);
    expect(todos).toHaveLength(100);
    expect(new Set(todos.map((e) => e.id)).size).toBe(100);
  });

  it('elegir, ordenar y escribir traen explicación; los demás tipos no la tuvieron en la versión heredada', () => {
    const todos = seedUnits.flatMap((u) => u.exercises);
    const conExplicacion = (tipos: string[]) => todos.filter((e) => tipos.includes(e.type));
    expect(conExplicacion(['mc', 'order', 'write'])).toHaveLength(65);
    expect(conExplicacion(['mc', 'order', 'write']).every((e) => (e.tip ?? '').length > 0)).toBe(
      true,
    );
    expect(conExplicacion(['listen', 'match', 'speak']).every((e) => e.tip === undefined)).toBe(
      true,
    );
  });

  it('conserva vocabulario de ejemplo de cada unidad', () => {
    const respuesta = (id: string, i: number) => {
      const e = seedUnits.find((u) => u.id === id)!.exercises[i]!;
      return e.type === 'mc' ? e.options[e.answerIndex]!.text : '';
    };
    expect(respuesta('u-saludos', 0)).toBe('Hello');
    expect(respuesta('u-comida', 0)).toBe('Apple');
    expect(respuesta('u-familia', 0)).toBe('Mother');
    expect(respuesta('u-viajes', 0)).toBe('Airport');
    expect(respuesta('u-trabajo', 0)).toBe('Office');
  });
});

describe('semilla: temas de Nova', () => {
  it('son 5, uno por unidad, con 8 turnos y respuestas aceptadas', () => {
    expect(seedDialogues).toHaveLength(5);
    expect(seedDialogues.map((d) => d.unitId)).toEqual(UNIDADES);
    for (const d of seedDialogues) {
      expect(d.turns).toHaveLength(8);
      for (const t of d.turns) expect(t.accepted.length).toBeGreaterThan(0);
    }
  });

  it('conservan las condiciones especiales de la versión heredada', () => {
    const presentarse = seedDialogues.find((d) => d.id === 't-presentarse')!;
    expect(presentarse.turns[0]!.rejectWords).toContain('tired');
    expect(presentarse.turns[3]!.requiredPattern).toContain('twenty');
    const familia = seedDialogues.find((d) => d.id === 't-hablar-de-la-familia')!;
    expect(familia.turns[4]!.requiredPattern).toBe('(big|small|large|little)');
  });
});

describe('semilla: logros', () => {
  it('son los 14 de la versión heredada, en su orden', () => {
    expect(seedAchievements.map((a) => a.id)).toEqual([
      'first',
      'streak3',
      'streak7',
      'xp100',
      'xp500',
      'perfect',
      'unit1',
      'unit3',
      'unit5',
      'nova',
      'c50',
      'gems200',
      'goal',
      'timed',
    ]);
  });

  it('cada condición es una estadística de la lista cerrada con su umbral', () => {
    const condicion = (id: string) => seedAchievements.find((a) => a.id === id)!.condition;
    expect(condicion('first')).toEqual({ stat: 'lessons', atLeast: 1 });
    expect(condicion('streak7')).toEqual({ stat: 'streak', atLeast: 7 });
    expect(condicion('unit5')).toEqual({ stat: 'unitsCompleted', atLeast: 5 });
    expect(condicion('goal')).toEqual({ stat: 'dailyGoalReached', atLeast: 1 });
    expect(condicion('timed')).toEqual({ stat: 'timedBest', atLeast: 10 });
  });
});

describe('semilla: curso completo', () => {
  it('valida con todas sus referencias cruzadas', () => {
    expect(CourseSchema.safeParse(seedCourse).success).toBe(true);
    expect(seedCourse).toMatchObject({ schemaVersion: 1, from: 'es', to: 'en', level: 'A1-A2' });
  });

  it('un tema que apunta a una unidad inexistente invalida el curso', () => {
    const roto = { ...seedCourse, dialogues: [{ ...seedDialogues[0]!, unitId: 'u-no-existe' }] };
    expect(CourseSchema.safeParse(roto).success).toBe(false);
  });

  it('ids repetidos de unidad, tema o logro invalidan el curso', () => {
    expect(
      CourseSchema.safeParse({ ...seedCourse, units: [...seedCourse.units, seedCourse.units[0]!] })
        .success,
    ).toBe(false);
    expect(
      CourseSchema.safeParse({ ...seedCourse, dialogues: [...seedDialogues, seedDialogues[0]!] })
        .success,
    ).toBe(false);
    expect(
      CourseSchema.safeParse({
        ...seedCourse,
        achievements: [...seedAchievements, seedAchievements[0]!],
      }).success,
    ).toBe(false);
  });
});

describe('semilla: enseñanza previa', () => {
  const lecciones = seedUnits.flatMap((u) => u.lessons);

  it('las 15 lecciones traen sus tarjetas', () => {
    expect(lecciones).toHaveLength(15);
    for (const l of lecciones) expect(l.teach?.length, l.id).toBeGreaterThan(0);
  });

  it('ninguna lección evalúa algo que ella o una anterior no enseñan', () => {
    expect(findUntaughtTerms(seedUnits, { requireTeach: true })).toEqual([]);
  });

  it('ninguna palabra o frase se enseña dos veces en el curso', () => {
    const vistas = lecciones.flatMap((l) => l.teach ?? []).map((c) => normalizeTerm(c.en));
    expect(new Set(vistas).size).toBe(vistas.length);
  });
});
