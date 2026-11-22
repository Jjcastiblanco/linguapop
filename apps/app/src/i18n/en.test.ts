import { seedUnits } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { ENGLISH_INSTRUCTIONS_FROM_UNIT, INSTRUCTION_KEYS, en, instructionsInEnglish } from './en';
import { es } from './es';

describe('instrucciones en inglés', () => {
  it('cada instrucción tiene su texto en inglés y su traducción al español', () => {
    for (const key of INSTRUCTION_KEYS) {
      expect(en[key].trim().length, key).toBeGreaterThan(0);
      expect(es[key].trim().length, key).toBeGreaterThan(0);
      expect(en[key], key).not.toBe(es[key]);
    }
    expect(Object.keys(en).sort()).toEqual([...INSTRUCTION_KEYS].sort());
  });

  it('la unidad 1 queda en español y desde la unidad 2 salen en inglés', () => {
    expect(ENGLISH_INSTRUCTIONS_FROM_UNIT).toBe(2);
    const [u1, u2, u3] = seedUnits;
    expect(instructionsInEnglish(seedUnits, `${u1!.id}-e01`)).toBe(false);
    expect(instructionsInEnglish(seedUnits, `${u2!.id}-e01`)).toBe(true);
    expect(instructionsInEnglish(seedUnits, `${u3!.id}-e07`)).toBe(true);
  });

  it('palabras sueltas, lecturas y ids desconocidos quedan en español', () => {
    expect(instructionsInEnglish(seedUnits, 'w-banana')).toBe(false);
    expect(instructionsInEnglish(seedUnits, 'read-comida-1-q1')).toBe(false);
    expect(instructionsInEnglish(seedUnits, 'pair-ship-sheep')).toBe(false);
    expect(instructionsInEnglish([], 'u-comida-e01')).toBe(false);
  });
});
