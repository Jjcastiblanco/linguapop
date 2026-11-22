import type { Course } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { readingExercises, seedReadings } from '@linguapop/content';
import { SKILLS, masteryReport, skillOf } from './mastery';
import { initialProgress } from './state';

const ex = (id: string, type: string, retired = false) =>
  ({
    id,
    type,
    retired,
    en: 'a',
    es: 'b',
  }) as unknown as Course['units'][number]['exercises'][number];
const unit = (id: string, exercises: ReturnType<typeof ex>[]) =>
  ({ id, name: id, exercises }) as unknown as Course['units'][number];

describe('skillOf', () => {
  it('asigna la habilidad por tipo de ejercicio', () => {
    expect(skillOf('listen')).toBe('listen');
    expect(skillOf('speak')).toBe('speak');
    expect(skillOf('write')).toBe('write');
    expect(skillOf('order')).toBe('write');
    expect(skillOf('mc')).toBe('recognize');
    expect(skillOf('match')).toBe('recognize');
  });
});

describe('masteryReport', () => {
  const units = [
    unit('a', [ex('a1', 'mc'), ex('a2', 'write'), ex('a3', 'listen', true)]),
    unit('b', [ex('b1', 'speak'), ex('b2', 'order')]),
    unit('c', [ex('c1', 'mc', true)]),
  ];

  it('cuenta dominados entre total, sin retirados, y total 0 da 0 %', () => {
    const p = {
      ...initialProgress(),
      reviews: {
        a1: { stage: 2 as const, due: '2026-12-01', mastered: true },
        a2: { stage: 1 as const, due: '2026-12-01' },
        a3: { stage: 2 as const, due: '2026-12-01', mastered: true },
        b2: { stage: 2 as const, due: '2026-12-01', mastered: true },
      },
    };
    const r = masteryReport(units, p);
    expect(r.byUnit.map((u) => [u.mastered, u.total, u.percent])).toEqual([
      [1, 2, 50],
      [1, 2, 50],
      [0, 0, 0],
    ]);
    expect(r.bySkill.recognize).toEqual({ mastered: 1, total: 1, percent: 100 });
    expect(r.bySkill.write).toEqual({ mastered: 1, total: 2, percent: 50 });
    expect(r.bySkill.listen.total).toBe(0);
    expect(r.bySkill.speak.percent).toBe(0);
  });

  it('la retención solo aparece con al menos 5 resultados', () => {
    const base = initialProgress();
    expect(
      masteryReport(units, { ...base, retention7: [true, true, true, true] }).retention7,
    ).toBeNull();
    expect(
      masteryReport(units, { ...base, retention7: [true, true, true, false, false] }).retention7,
    ).toBe(60);
  });
});

describe('habilidad «Leer»', () => {
  const unidades = [unit('u-saludos', [ex('x1', 'mc')]), unit('u-comida', [ex('y1', 'write')])];
  const texto = seedReadings.find((t) => t.unitId === 'u-saludos')!;
  const preguntas = readingExercises(texto);

  it('es una habilidad más, al final', () => {
    expect(SKILLS.at(-1)).toBe('read');
  });

  it('las preguntas de lectura cuentan en «Leer» y en la unidad de su texto', () => {
    const p = {
      ...initialProgress(),
      reviews: { [preguntas[0]!.id]: { stage: 2 as const, due: '2026-12-01', mastered: true } },
    };
    const r = masteryReport(unidades, p, [texto]);
    expect(r.bySkill.read).toEqual({
      mastered: 1,
      total: preguntas.length,
      percent: Math.round((100 * 1) / preguntas.length),
    });
    expect(r.byUnit[0]).toMatchObject({
      unitId: 'u-saludos',
      total: 1 + preguntas.length,
      mastered: 1,
    });
    expect(r.byUnit[1]).toMatchObject({ unitId: 'u-comida', total: 1 });
    expect(r.bySkill.recognize.total).toBe(1);
  });

  it('sin textos «Leer» queda en 0 %', () => {
    expect(masteryReport(unidades, initialProgress()).bySkill.read).toEqual({
      mastered: 0,
      total: 0,
      percent: 0,
    });
  });
});
