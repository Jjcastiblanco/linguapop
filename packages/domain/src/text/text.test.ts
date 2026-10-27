import { describe, expect, it } from 'vitest';
import texto from '../../fixtures/texto.json';
import { levenshtein, matchesPattern, matchesTurn, normalizeText, similarity } from './index';

// Los resultados de referencia salen de linguapop.html (ver packages/domain/fixtures).

describe('normalizeText: casos de referencia', () => {
  it.each(texto.normalizar)('normaliza "$entrada"', ({ entrada, esperado }) => {
    expect(normalizeText(entrada)).toBe(esperado);
  });
});

describe('similarity: casos de referencia', () => {
  it.each(texto.similitud)('"$a" contra "$b"', ({ a, b, esperado }) => {
    expect(similarity(a, b)).toBeCloseTo(esperado, 5);
  });
});

describe('matchesTurn: respuestas de Nova de referencia', () => {
  it.each(texto.respuestasNova)(
    '$tema, turno $turno: "$texto"',
    ({ texto: respuesta, giro, esperado }) => {
      expect(matchesTurn(respuesta, giro)).toBe(esperado);
    },
  );

  it('los casos de referencia incluyen aceptadas y rechazadas', () => {
    expect(texto.respuestasNova.some((c) => c.esperado)).toBe(true);
    expect(texto.respuestasNova.some((c) => !c.esperado)).toBe(true);
  });
});

describe('comportamientos concretos', () => {
  it('ignora mayúsculas, puntuación, acentos y apóstrofos tipográficos', () => {
    expect(normalizeText('  ¡HELLO,   Wörld!  ')).toBe('hello world');
    expect(normalizeText('I’m fine')).toBe('i am fine');
    expect(normalizeText(null as unknown as string)).toBe('');
  });

  it('expande contracciones', () => {
    expect(normalizeText("She isn't here")).toBe('she is not here');
    expect(normalizeText("What's your name?")).toBe('what is your name');
    expect(normalizeText('I cannot go')).toBe('i can not go');
  });

  it('levenshtein cuenta ediciones', () => {
    expect(levenshtein('casa', 'casa')).toBe(0);
    expect(levenshtein('casa', 'cosa')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('el comodín exige al menos una palabra', () => {
    expect(matchesPattern('my name is ana', 'my name is *')).toBe(true);
    expect(matchesPattern('my name is', 'my name is *')).toBe(false);
  });

  it('acepta una frase contenida dentro de una respuesta más larga', () => {
    expect(matchesTurn('well, see you later my friend', { accepted: ['see you later'] })).toBe(
      true,
    );
  });

  it('las palabras rechazadas invalidan aunque haya coincidencia', () => {
    const turno = { accepted: ['i am *'], rejectWords: ['tired'] };
    expect(matchesTurn('I am Ana', turno)).toBe(true);
    expect(matchesTurn('I am tired', turno)).toBe(false);
  });

  it('el patrón requerido debe cumplirse', () => {
    const turno = { accepted: ['i am *'], requiredPattern: '(\\d+|twenty)' };
    expect(matchesTurn('I am 25', turno)).toBe(true);
    expect(matchesTurn('I am fine', turno)).toBe(false);
  });

  it('un patrón requerido mal escrito no rompe la conversación', () => {
    expect(matchesTurn('I am Ana', { accepted: ['i am *'], requiredPattern: '(sin cerrar' })).toBe(
      false,
    );
  });

  it('un texto vacío o solo de signos nunca vale', () => {
    expect(matchesTurn('   ', { accepted: ['hello'] })).toBe(false);
    expect(matchesTurn('?!', { accepted: ['hello'] })).toBe(false);
  });

  it('tolera un error de reconocimiento de voz cercano', () => {
    expect(matchesTurn('my name is anna', { accepted: ['my name is *'] })).toBe(true);
    expect(matchesTurn('see you leter', { accepted: ['see you later'] })).toBe(true);
  });
});
