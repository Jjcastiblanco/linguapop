import type { MinimalPair } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import type { Random } from '../ports';
import { buildEarSession } from './ear';

const pares = (n: number): MinimalPair[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `pair-a${i}-b${i}`,
    a: { en: `a${i}`, es: `A${i}` },
    b: { en: `b${i}`, es: `B${i}` },
    contrast: 'b-v',
  }));

const secuencia = (...values: number[]): Random => {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
};

describe('buildEarSession', () => {
  it('arma 10 intentos con pares distintos', () => {
    const intentos = buildEarSession(pares(30), secuencia(0.1, 0.7, 0.4));
    expect(intentos).toHaveLength(10);
    expect(new Set(intentos.map((a) => a.pairId)).size).toBe(10);
  });

  it('con menos de 10 pares usa todos', () => {
    expect(buildEarSession(pares(4), secuencia(0.3))).toHaveLength(4);
    expect(buildEarSession([], secuencia(0.3))).toEqual([]);
  });

  it('en cada intento suena una de las dos palabras y la otra es la restante', () => {
    for (const a of buildEarSession(pares(10), secuencia(0.2, 0.8))) {
      const n = a.pairId.replace('pair-a', '').split('-')[0];
      expect([a.word.en, a.other.en].sort()).toEqual([`a${n}`, `b${n}`]);
    }
  });

  it('es repetible con el mismo aleatorio y llega a sortear las dos palabras', () => {
    const una = buildEarSession(pares(30), secuencia(0.1, 0.9, 0.5, 0.3));
    const otra = buildEarSession(pares(30), secuencia(0.1, 0.9, 0.5, 0.3));
    expect(una).toEqual(otra);
    expect(new Set(una.map((a) => a.word.en[0])).size).toBe(2);
  });

  it('respeta el tamaño pedido', () => {
    expect(buildEarSession(pares(30), secuencia(0.5), 3)).toHaveLength(3);
  });
});
