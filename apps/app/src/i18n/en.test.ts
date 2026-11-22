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

describe('catálogo en inglés (modo inmersión)', () => {
  it('tiene exactamente las mismas claves que el español, sin vacías', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const [key, text] of Object.entries(en))
      expect(text.trim().length, key).toBeGreaterThan(0);
  });

  it('cada texto conserva los mismos marcadores que el español', () => {
    const marcadores = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(es) as Array<keyof typeof es>) {
      expect(marcadores(en[key]), key).toEqual(marcadores(es[key]));
    }
  });

  it('solo coinciden con el español los nombres propios, las siglas y los símbolos', () => {
    const iguales = (Object.keys(es) as Array<keyof typeof es>).filter((k) => en[k] === es[k]);
    expect(iguales.sort()).toEqual(
      [
        'app.name',
        'app.pro',
        'topbar.unlimited',
        'speak.heard',
        'result.xp',
        'learn.chest.reward',
        'pro.title',
        'league.xp',
        'league.bot',
        'profile.minutes',
        'profile.level.a1',
        'profile.level.a2',
        'mascot.nova',
      ].sort(),
    );
  });
});
