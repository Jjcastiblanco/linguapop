import { describe, expect, it } from 'vitest';
import { audioKey, audioText, collectSpokenTexts, speedFor } from './audio';
import { seedUnits } from './seed';

describe('audio pregrabado: nombres', () => {
  it('el mismo texto da la misma clave y se ignoran los espacios sobrantes', () => {
    expect(audioKey('Good morning')).toBe(audioKey('  Good   morning '));
    expect(audioText('  Good   morning ')).toBe('Good morning');
  });

  it('el texto y la velocidad distinguen las claves', () => {
    expect(audioKey('Hello')).not.toBe(audioKey('hello'));
    expect(audioKey('Hello', 'normal')).not.toBe(audioKey('Hello', 'slow'));
    expect(audioKey('Hello')).toMatch(/^[0-9a-f]{14}$/);
  });

  it('elige la grabación lenta por debajo de 0,7 y ajusta la normal en el resto', () => {
    expect(speedFor(0.55)).toEqual({ speed: 'slow', playbackRate: 1 });
    expect(speedFor(0.6)).toEqual({ speed: 'slow', playbackRate: 1 });
    expect(speedFor(0.8)).toEqual({ speed: 'normal', playbackRate: 0.8 });
    expect(speedFor(1)).toEqual({ speed: 'normal', playbackRate: 1 });
    expect(speedFor(1.1)).toEqual({ speed: 'normal', playbackRate: 1.1 });
  });
});

describe('audio pregrabado: qué se dice', () => {
  const spoken = collectSpokenTexts(seedUnits);
  const keys = new Set(spoken.map((s) => audioKey(s.text, s.speed)));

  it('no repite textos y no hay claves en colisión', () => {
    expect(keys.size).toBe(spoken.length);
  });

  it('incluye frases, palabras sueltas y la versión lenta de las frases', () => {
    const textos = new Set(spoken.map((s) => `${s.speed}|${s.text}`));
    expect(textos.has('normal|Nice to meet you')).toBe(true);
    expect(textos.has('slow|Nice to meet you')).toBe(true);
    expect(textos.has('normal|Nice')).toBe(true);
    expect(textos.has('slow|Nice')).toBe(false);
  });

  it('el curso trae cientos de textos y ninguno vacío', () => {
    expect(spoken.length).toBeGreaterThan(300);
    expect(spoken.every((s) => s.text.length > 0)).toBe(true);
  });
});
