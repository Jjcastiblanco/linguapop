import type { Unit } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { placementOffer } from './placement-offer';

const unidad = (id: string): Unit =>
  ({ id, lessons: [1, 2, 3].map((n) => ({ id: `${id}-l${n}` })) }) as unknown as Unit;
const UNIDADES = [unidad('a'), unidad('b'), unidad('c')];

describe('placementOffer', () => {
  it('al empezar ofrece la primera unidad', () => {
    expect(placementOffer(UNIDADES, {})?.id).toBe('a');
  });

  it('al cerrar una unidad ofrece la siguiente', () => {
    expect(placementOffer(UNIDADES, { a: 3 })?.id).toBe('b');
    expect(placementOffer(UNIDADES, { a: 3, b: 3 })?.id).toBe('c');
  });

  it('a mitad de una unidad no ofrece nada', () => {
    expect(placementOffer(UNIDADES, { a: 1 })).toBeNull();
    expect(placementOffer(UNIDADES, { a: 3, b: 2 })).toBeNull();
  });

  it('con todo completo o sin unidades no ofrece nada', () => {
    expect(placementOffer(UNIDADES, { a: 3, b: 3, c: 3 })).toBeNull();
    expect(placementOffer([], {})).toBeNull();
  });
});
