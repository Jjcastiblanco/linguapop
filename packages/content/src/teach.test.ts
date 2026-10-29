import { describe, expect, it } from 'vitest';
import { CourseSchema, LessonSchema, UnitSchema, type Unit } from './schema';
import { evaluatedTerms, findUntaughtTerms, normalizeTerm } from './teach';
import { seedCourse, seedUnits } from './seed';

/** Unidad mínima: 15 ejercicios `listen` y lecciones definidas por la prueba. */
function unidad(lessons: Unit['lessons'], id = 'u-demo'): Unit {
  return UnitSchema.parse({
    id,
    name: 'Demo',
    emoji: '👋',
    color: '#ff8a1f',
    colorDark: '#c76200',
    description: 'Unidad de prueba',
    exercises: Array.from({ length: 15 }, (_, i) => ({
      id: `${id}-e${String(i + 1).padStart(2, '0')}`,
      type: 'listen',
      en: `Phrase ${i + 1}`,
      es: `Frase ${i + 1}`,
    })),
    lessons,
  });
}

const tarjeta = (n: number) => ({ en: `Phrase ${n}`, es: `Frase ${n}`, emoji: '👋' });

describe('campo teach de la lección', () => {
  it('es opcional: una lección sin teach sigue siendo válida', () => {
    expect(LessonSchema.safeParse({ id: 'u-demo-l1', exerciseIds: ['u-demo-e01'] }).success).toBe(
      true,
    );
  });

  it('acepta tarjetas con o sin emoji y rechaza textos vacíos', () => {
    const ok = { id: 'u-demo-l1', exerciseIds: ['u-demo-e01'], teach: [{ en: 'Hi', es: 'Hola' }] };
    expect(LessonSchema.safeParse(ok).success).toBe(true);
    expect(LessonSchema.safeParse({ ...ok, teach: [{ en: ' ', es: 'Hola' }] }).success).toBe(false);
  });

  it('el contenido semilla sigue siendo válido si se le quita teach (aditivo)', () => {
    const sinTeach = {
      ...seedCourse,
      units: seedCourse.units.map((u) => ({
        ...u,
        lessons: u.lessons.map(({ teach: _teach, ...lesson }) => lesson),
      })),
    };
    expect(CourseSchema.safeParse(sinTeach).success).toBe(true);
    expect(findUntaughtTerms(sinTeach.units)).toEqual([]);
  });
});

describe('qué evalúa cada ejercicio', () => {
  const por = (tipo: string) => seedUnits.flatMap((u) => u.exercises).find((e) => e.type === tipo)!;

  it('frases en order, write, listen y speak', () => {
    for (const t of ['order', 'write', 'listen', 'speak']) {
      expect(evaluatedTerms(por(t))).toEqual([(por(t) as { en: string }).en]);
    }
  });

  it('cada par de match', () => {
    expect(evaluatedTerms(por('match'))).toHaveLength(4);
  });

  it('en mc, la opción correcta o la frase entre comillas de «Qué significa»', () => {
    const mc = seedUnits.flatMap((u) => u.exercises).filter((e) => e.type === 'mc');
    const significa = mc.find((e) => /significa/i.test((e as { prompt: string }).prompt))!;
    expect(evaluatedTerms(significa)).toEqual(['I am fine']);
    const dice = mc.find((e) => /se dice/i.test((e as { prompt: string }).prompt))!;
    expect(evaluatedTerms(dice)).toEqual(['Hello']);
  });
});

describe('regla de cobertura', () => {
  it('una lección con teach que evalúa algo no enseñado falla y nombra la palabra', () => {
    const u = unidad([
      { id: 'u-demo-l1', exerciseIds: ['u-demo-e01', 'u-demo-e02'], teach: [tarjeta(1)] },
    ]);
    expect(findUntaughtTerms([u])).toEqual([
      { unitId: 'u-demo', lessonId: 'u-demo-l1', exerciseId: 'u-demo-e02', term: 'Phrase 2' },
    ]);
  });

  it('una lección sin teach no se revisa, salvo con requireTeach', () => {
    const u = unidad([{ id: 'u-demo-l1', exerciseIds: ['u-demo-e01'] }]);
    expect(findUntaughtTerms([u])).toEqual([]);
    expect(findUntaughtTerms([u], { requireTeach: true })).toHaveLength(1);
  });

  it('lo enseñado por una lección anterior cuenta, aunque sea de otra unidad', () => {
    const a = unidad([{ id: 'u-demo-l1', exerciseIds: ['u-demo-e01'], teach: [tarjeta(1)] }]);
    const b = unidad(
      [{ id: 'u-otra-l1', exerciseIds: ['u-otra-e01'], teach: [{ en: 'Phrase 1', es: 'x' }] }],
      'u-otra',
    );
    expect(findUntaughtTerms([a, b])).toEqual([]);
  });

  it('lo enseñado por una lección posterior no cuenta', () => {
    const u = unidad([
      { id: 'u-demo-l1', exerciseIds: ['u-demo-e02'], teach: [tarjeta(1)] },
      { id: 'u-demo-l2', exerciseIds: ['u-demo-e03'], teach: [tarjeta(2), tarjeta(3)] },
    ]);
    expect(findUntaughtTerms([u]).map((m) => m.exerciseId)).toEqual(['u-demo-e02']);
  });

  it('compara sin mayúsculas, acentos ni signos', () => {
    expect(normalizeTerm('  Good, Morning! ')).toBe('good morning');
    expect(normalizeTerm('Café')).toBe('cafe');
  });

  it('el curso rechaza una lección que evalúa lo no enseñado, con el mensaje que la nombra', () => {
    const curso = {
      ...seedCourse,
      units: [unidad([{ id: 'u-demo-l1', exerciseIds: ['u-demo-e02'], teach: [tarjeta(1)] }])],
      dialogues: [],
    };
    const r = CourseSchema.safeParse(curso);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('Phrase 2');
  });
});
