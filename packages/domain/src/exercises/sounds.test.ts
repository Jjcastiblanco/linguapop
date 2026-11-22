import { describe, expect, it } from 'vitest';
import { judgeSpeech, substitutionOf } from './sounds';

describe('substitutionOf', () => {
  it('reconoce la «e» delante de s + consonante (epéntesis)', () => {
    expect(substitutionOf('espeak', 'speak')).toBe('epenthesis');
    expect(substitutionOf('eschool', 'school')).toBe('epenthesis');
    expect(substitutionOf('esay', 'say')).toBeNull(); // s + vocal no lleva «e»
    expect(substitutionOf('eat', 'at')).toBeNull();
  });

  it('reconoce /θ/ y /ð/ dichas como t, d, s o f', () => {
    expect(substitutionOf('tink', 'think')).toBe('th');
    expect(substitutionOf('sink', 'think')).toBe('th');
    expect(substitutionOf('fink', 'think')).toBe('th');
    expect(substitutionOf('dis', 'this')).toBe('th');
    expect(substitutionOf('tank', 'think')).toBeNull();
  });

  it('reconoce /v/ dicha como /b/ y la vocal larga dicha como corta', () => {
    expect(substitutionOf('berry', 'very')).toBe('b-v');
    expect(substitutionOf('ship', 'sheep')).toBe('long-short-i');
    expect(substitutionOf('live', 'leave')).toBe('long-short-i');
    expect(substitutionOf('sit', 'seat')).toBe('long-short-i');
    expect(substitutionOf('boat', 'very')).toBeNull();
  });
});

describe('judgeSpeech', () => {
  it('una frase igual no necesita ningún aviso', () => {
    expect(judgeSpeech('I think so', 'I think so')).toEqual({ accepted: true });
  });

  it('acepta sin aviso las sustituciones de baja carga, aunque sea una sola palabra', () => {
    expect(judgeSpeech('espeak', 'speak')).toEqual({ accepted: true });
    expect(judgeSpeech('I tink so', 'I think so')).toEqual({ accepted: true });
    expect(judgeSpeech('espeak tink', 'speak think')).toEqual({ accepted: true });
  });

  it('con un sonido que confunde y 3 palabras o más acepta y avisa del sonido', () => {
    expect(judgeSpeech('It is berry good', 'It is very good')).toEqual({
      accepted: true,
      hint: { kind: 'b-v', expected: 'very', heard: 'berry' },
    });
    expect(judgeSpeech('I like the ship', 'I like the sheep')).toMatchObject({
      accepted: true,
      hint: { kind: 'long-short-i', expected: 'sheep', heard: 'ship' },
    });
  });

  it('con 1 o 2 palabras no acepta por la regla, pero avisa del sonido', () => {
    expect(judgeSpeech('berry good', 'very good')).toEqual({
      accepted: false,
      hint: { kind: 'b-v', expected: 'very', heard: 'berry' },
    });
  });

  it('una palabra distinta sin explicación fonética falla y nombra la palabra', () => {
    expect(judgeSpeech('I am fine banana', 'I am fine thank')).toEqual({
      accepted: false,
      hint: { kind: 'word', expected: 'thank', heard: 'banana' },
    });
  });

  it('dos sustituciones que confunden a la vez no se aceptan por la regla', () => {
    const r = judgeSpeech('It is berry ship', 'It is very sheep');
    expect(r?.accepted).toBe(false);
    expect(r?.hint?.kind).toBe('word');
  });

  it('sin el mismo número de palabras no opina (manda el parecido de texto)', () => {
    expect(judgeSpeech('I am', 'I am fine')).toBeNull();
    expect(judgeSpeech('', 'I am fine')).toBeNull();
    expect(judgeSpeech('a b c d e', 'v w x')).toBeNull();
  });

  it('con tres palabras distintas o más no opina', () => {
    expect(judgeSpeech('a b c', 'x y z')).toBeNull();
  });
});
