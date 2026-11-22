import type { Course } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { buildReinforceList, practiceConfig } from '../practice';
import { RETENTION_LOW_PERCENT, SKILL_ERRORS_MIN, reinforcementNeeded } from './reinforce';
import { initialProgress, type ProgressState } from './state';

type Ex = Course['units'][number]['exercises'][number];
const ex = (id: string, type: string, retired = false) =>
  ({ id, type, retired, en: 'a', es: 'b' }) as unknown as Ex;
const listens = (n: number, prefix = 'l') =>
  Array.from({ length: n }, (_, i) => ex(`${prefix}${i}`, 'listen'));
const unit = (id: string, exercises: Ex[]) =>
  ({
    id,
    name: id,
    lessons: [{ id: `${id}-l1` }],
    exercises,
  }) as unknown as Course['units'][number];

const units = [
  unit('a', [...listens(6), ex('w1', 'write'), ex('r', 'listen', true)]),
  unit('b', listens(6, 'c')),
];
const p = (o: Partial<ProgressState> = {}): ProgressState => ({ ...initialProgress(), ...o });
const ids = (n: number, prefix = 'l') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const resultados = (ok: number, total: number) => Array.from({ length: total }, (_, i) => i < ok);

describe('reinforcementNeeded', () => {
  it('retención baja con 5 o más resultados pide refuerzo', () => {
    expect(reinforcementNeeded(units, p({ retention7: resultados(2, 5), errors: ['l0'] }))).toEqual(
      { reason: 'retention' },
    );
  });
  it('retención baja sin nada que reforzar no ofrece una tarjeta que no haría nada', () => {
    expect(reinforcementNeeded(units, p({ retention7: resultados(0, 5) }))).toBeNull();
    expect(
      reinforcementNeeded(
        units,
        p({ retention7: resultados(0, 5), errors: ['w-cheese', 'c0'], weak: { c1: 4 } }),
      ),
    ).toBeNull();
    expect(
      reinforcementNeeded(units, p({ retention7: resultados(0, 5), weak: { l1: 2 } })),
    ).toEqual({ reason: 'retention' });
  });
  it('exactamente en el límite no pide refuerzo', () => {
    expect(RETENTION_LOW_PERCENT).toBe(60);
    expect(reinforcementNeeded(units, p({ retention7: resultados(3, 5) }))).toBeNull();
  });
  it('con menos de 5 resultados no hay refuerzo por retención', () => {
    expect(reinforcementNeeded(units, p({ retention7: resultados(0, 4) }))).toBeNull();
  });
  it('una habilidad con 5 errores pide refuerzo por esa habilidad', () => {
    expect(SKILL_ERRORS_MIN).toBe(5);
    expect(reinforcementNeeded(units, p({ errors: ids(5) }))).toEqual({
      reason: 'skill',
      skill: 'listen',
    });
    expect(reinforcementNeeded(units, p({ errors: ids(4) }))).toBeNull();
  });
  it('no cuentan w-, retirados, desconocidos ni unidades cerradas', () => {
    const errors = ['w-cheese', 'w-bread', 'r', 'no-existe', 'l0', 'c0', 'c1', 'c2', 'c3'];
    expect(reinforcementNeeded(units, p({ errors }))).toBeNull();
    expect(reinforcementNeeded(units, p({ errors: [...errors, 'l1', 'l2', 'l3'] }))).toBeNull();
    expect(reinforcementNeeded(units, p({ errors: ids(4), lessonsDone: { a: 1 } }))).toBeNull();
    expect(
      reinforcementNeeded(units, p({ errors: [...ids(4), 'c0'], lessonsDone: { a: 1 } })),
    ).toEqual({ reason: 'skill', skill: 'listen' });
  });
  it('gana la retención cuando se dan ambos', () => {
    expect(reinforcementNeeded(units, p({ errors: ids(5), retention7: resultados(0, 5) }))).toEqual(
      { reason: 'retention' },
    );
  });
  it('sin condiciones no hay tarjeta', () => {
    expect(reinforcementNeeded(units, p())).toBeNull();
  });
});

describe('lista y sesión de refuerzo', () => {
  const input = (progress: ProgressState) => ({ units, progress, random: { next: () => 0.3 } });
  it('de habilidad usa solo esa habilidad, errores primero, hasta 12', () => {
    const progress = p({
      errors: ['w1', ...ids(5)],
      weak: { l5: 3, c0: 9 },
      lessonsDone: { a: 1 },
    });
    const lista = buildReinforceList(input(progress), 'skill', 'listen').map((e) => e.id);
    expect(lista).not.toContain('w1');
    expect(lista.slice(0, 5)).toEqual(ids(5));
    expect(lista).toHaveLength(7);
  });
  it('de retención mezcla habilidades, errores primero, luego los de más fallos, sin repetir y hasta 12', () => {
    const errors = [...ids(6), 'w1'];
    const progress = p({
      errors,
      weak: { l1: 9, l7: 1, c0: 8, c1: 5, c2: 2, c3: 1, c4: 1, c5: 1 },
      lessonsDone: { a: 3 },
    });
    const lista = buildReinforceList(input(progress), 'retention').map((e) => e.id);
    expect(lista).toHaveLength(12);
    expect(new Set(lista).size).toBe(12);
    expect(lista.slice(0, 7)).toEqual([...ids(6), 'w1']);
    expect(lista).not.toContain('l7');
  });
  it('practiceConfig con habilidad no mezcla las demás; sin habilidad sí', () => {
    const progress = p({ errors: [...ids(5), 'w1'], weak: { w1: 3 }, lessonsDone: { a: 1 } });
    const conHabilidad = practiceConfig(
      { kind: 'reinforce', skill: 'listen' },
      input(progress),
      '2026-10-27',
    );
    expect(conHabilidad.ok && conHabilidad.config.exercises.map((e) => e.id)).toEqual(ids(5));
    const sin = practiceConfig({ kind: 'reinforce' }, input(progress), '2026-10-27');
    expect(sin.ok && sin.config.exercises.map((e) => e.id)).toContain('w1');
  });
  it('practiceConfig: modo review, plan gratis, y vacío falla', () => {
    const free = { ...initialProgress().settings, plan: 'free' as const };
    const ok = practiceConfig(
      { kind: 'reinforce', skill: 'listen' },
      input(p({ settings: free, errors: ids(5) })),
      '2026-10-27',
    );
    expect(ok.ok && ok.config.mode).toBe('review');
    expect(ok.ok && ok.config.exercises).toHaveLength(5);
    const vacio = practiceConfig({ kind: 'reinforce' }, input(p()), '2026-10-27');
    expect(vacio).toEqual({ ok: false, reason: 'nothing-to-review' });
  });
});
