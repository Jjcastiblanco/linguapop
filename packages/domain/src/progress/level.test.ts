import type { Unit } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { estimatedLevel } from './level';

const unit = (id: string, n = 2) =>
  ({
    id,
    lessons: Array.from({ length: n }, (_, i) => ({ id: `${id}-l${i}` })),
  }) as unknown as Unit;
const five = ['u1', 'u2', 'u3', 'u4', 'u5'].map((id) => unit(id));

describe('estimatedLevel', () => {
  it('sin avance es Inicial, también sin unidades', () => {
    expect(estimatedLevel(five, {})).toBe('start');
    expect(estimatedLevel([], {})).toBe('start');
  });
  it('con lecciones y A1 incompleto es A1 en curso', () => {
    expect(estimatedLevel(five, { u1: 1 })).toBe('a1-progress');
    expect(estimatedLevel(five, { u1: 2, u2: 2, u3: 1 })).toBe('a1-progress');
  });
  it('con A1 completo y nada de A2 es A1', () => {
    expect(estimatedLevel(five, { u1: 2, u2: 2, u3: 2 })).toBe('a1');
  });
  it('con A2 empezado es A2 en curso', () => {
    expect(estimatedLevel(five, { u1: 2, u2: 2, u3: 2, u4: 1 })).toBe('a2-progress');
    expect(estimatedLevel(five, { u1: 2, u2: 2, u3: 2, u4: 2 })).toBe('a2-progress');
  });
  it('con todo completo es A2', () => {
    expect(estimatedLevel(five, { u1: 2, u2: 2, u3: 2, u4: 2, u5: 2 })).toBe('a2');
  });
  it('lo completado por la prueba de nivel cuenta igual', () => {
    const porPrueba = { u1: 2, u2: 2, u3: 2 };
    expect(estimatedLevel(five, porPrueba)).toBe('a1');
  });
  it('con menos de 3 unidades todas son A1', () => {
    const dos = [unit('u1'), unit('u2')];
    expect(estimatedLevel(dos, { u1: 2 })).toBe('a1-progress');
    expect(estimatedLevel(dos, { u1: 2, u2: 2 })).toBe('a1');
  });
});
