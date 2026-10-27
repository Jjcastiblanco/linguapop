import { seedUnits, type Exercise } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import type { Answer, ExerciseOf } from './answer';
import { checkAnswer, correctAnswerOf, isCorrectPair } from './check';

const mc: ExerciseOf<'mc'> = {
  id: 'u-demo-e01',
  type: 'mc',
  prompt: '¿Cómo se dice "Hola"?',
  options: [
    { emoji: '🌙', text: 'Good night' },
    { emoji: '👋', text: 'Hello' },
    { emoji: '😔', text: 'Sorry' },
  ],
  answerIndex: 1,
};
const order: ExerciseOf<'order'> = {
  id: 'u-demo-e02',
  type: 'order',
  es: 'Me llamo Ana',
  en: 'My name is Ana',
  extraWords: ['am', 'the'],
};
const write: ExerciseOf<'write'> = {
  id: 'u-demo-e03',
  type: 'write',
  es: 'Mucho gusto',
  en: 'Nice to meet you',
  alternatives: ['Pleased to meet you'],
};
const match: ExerciseOf<'match'> = {
  id: 'u-demo-e04',
  type: 'match',
  pairs: [
    { es: 'Hola', en: 'Hello' },
    { es: 'Adiós', en: 'Goodbye' },
    { es: 'Gracias', en: 'Thank you' },
  ],
};
const listen: ExerciseOf<'listen'> = {
  id: 'u-demo-e05',
  type: 'listen',
  en: 'Good afternoon',
  es: 'Buenas tardes',
};
const speak: ExerciseOf<'speak'> = {
  id: 'u-demo-e06',
  type: 'speak',
  en: 'I am fine, thank you',
  es: 'Estoy bien, gracias',
};

describe('elegir (mc)', () => {
  it('acierta con la opción correcta del contenido', () => {
    expect(checkAnswer(mc, { type: 'mc', optionIndex: 1 })).toEqual({
      ok: true,
      correctAnswer: 'Hello',
    });
  });

  it('falla con otra opción o con un índice fuera de rango', () => {
    expect(checkAnswer(mc, { type: 'mc', optionIndex: 0 }).ok).toBe(false);
    expect(checkAnswer(mc, { type: 'mc', optionIndex: 9 }).ok).toBe(false);
    expect(checkAnswer(mc, { type: 'mc', optionIndex: -1 }).ok).toBe(false);
  });

  it('al fallar informa la respuesta correcta', () => {
    expect(checkAnswer(mc, { type: 'mc', optionIndex: 2 }).correctAnswer).toBe('Hello');
  });
});

describe('ordenar (order)', () => {
  it('acierta con las palabras en orden, sin importar mayúsculas ni puntuación', () => {
    expect(checkAnswer(order, { type: 'order', words: ['My', 'name', 'is', 'Ana'] }).ok).toBe(true);
    expect(checkAnswer(order, { type: 'order', words: ['my', 'name', 'is', 'ana.'] }).ok).toBe(
      true,
    );
  });

  it('falla con otro orden, con palabras de sobra o de menos', () => {
    expect(checkAnswer(order, { type: 'order', words: ['name', 'My', 'is', 'Ana'] }).ok).toBe(
      false,
    );
    expect(checkAnswer(order, { type: 'order', words: ['My', 'name', 'am', 'is', 'Ana'] }).ok).toBe(
      false,
    );
    expect(checkAnswer(order, { type: 'order', words: ['My', 'name', 'is'] }).ok).toBe(false);
    expect(checkAnswer(order, { type: 'order', words: [] }).ok).toBe(false);
  });
});

describe('escribir (write)', () => {
  it('acierta con la respuesta, sus alternativas, otra capitalización y contracciones', () => {
    expect(checkAnswer(write, { type: 'write', text: 'Nice to meet you' }).ok).toBe(true);
    expect(checkAnswer(write, { type: 'write', text: 'pleased to meet you!' }).ok).toBe(true);
    expect(checkAnswer(write, { type: 'write', text: '  NICE   TO MEET YOU. ' }).ok).toBe(true);
    const contraccion: ExerciseOf<'write'> = {
      ...write,
      en: 'What is your name',
      alternatives: [],
    };
    expect(checkAnswer(contraccion, { type: 'write', text: "What's your name?" }).ok).toBe(true);
  });

  it('acierta exacto sin marcar errata', () => {
    expect(checkAnswer(write, { type: 'write', text: 'Nice to meet you' }).typo).toBeUndefined();
  });

  it('tolera una errata de una letra en respuestas de más de 5 letras', () => {
    const r = checkAnswer(write, { type: 'write', text: 'Nice to meat you' });
    expect(r).toMatchObject({ ok: true, typo: true, correctAnswer: 'Nice to meet you' });
    expect(checkAnswer(write, { type: 'write', text: 'Pleased to meet yu' })).toMatchObject({
      ok: true,
      typo: true,
    });
  });

  it('no tolera dos errores ni erratas en respuestas cortas', () => {
    expect(checkAnswer(write, { type: 'write', text: 'Nice to meat yo' }).ok).toBe(false);
    const corta: ExerciseOf<'write'> = { ...write, en: 'Boss', alternatives: [] };
    expect(checkAnswer(corta, { type: 'write', text: 'Bos' }).ok).toBe(false); // menos de 6 letras: sin tolerancia
    expect(checkAnswer(corta, { type: 'write', text: 'Boss' }).ok).toBe(true);
    const justa: ExerciseOf<'write'> = { ...write, en: 'My boss', alternatives: [] };
    expect(checkAnswer(justa, { type: 'write', text: 'My bos' })).toMatchObject({
      ok: true,
      typo: true,
    }); // 6 letras: ya se tolera
  });

  it('falla con respuestas distintas o vacías', () => {
    expect(checkAnswer(write, { type: 'write', text: 'Good morning' }).ok).toBe(false);
    expect(checkAnswer(write, { type: 'write', text: '' }).ok).toBe(false);
  });
});

describe('emparejar (match)', () => {
  it('acierta con hasta 2 intentos fallidos y falla con 3', () => {
    for (const mistakes of [0, 1, 2])
      expect(checkAnswer(match, { type: 'match', mistakes }).ok).toBe(true);
    expect(checkAnswer(match, { type: 'match', mistakes: 3 }).ok).toBe(false);
  });

  it('informa los intentos fallidos y la solución completa', () => {
    expect(checkAnswer(match, { type: 'match', mistakes: 0 })).toEqual({
      ok: true,
      correctAnswer: 'Hola = Hello · Adiós = Goodbye · Gracias = Thank you',
    });
    expect(checkAnswer(match, { type: 'match', mistakes: 2 }).mistakes).toBe(2);
  });

  it('valida cada pareja', () => {
    expect(isCorrectPair(match, 'Hola', 'Hello')).toBe(true);
    expect(isCorrectPair(match, 'Hola', 'Goodbye')).toBe(false);
    expect(isCorrectPair(match, 'Nada', 'Hello')).toBe(false);
  });
});

describe('escuchar (listen)', () => {
  it('acierta con la frase, con una errata de una letra, y siempre trae la traducción', () => {
    expect(checkAnswer(listen, { type: 'listen', text: 'good afternoon' })).toMatchObject({
      ok: true,
      translation: 'Buenas tardes',
    });
    expect(checkAnswer(listen, { type: 'listen', text: 'Good afternon' })).toMatchObject({
      ok: true,
      typo: true,
    });
  });

  it('falla con otra frase y aun así trae la traducción', () => {
    expect(checkAnswer(listen, { type: 'listen', text: 'Good evening' })).toMatchObject({
      ok: false,
      correctAnswer: 'Good afternoon',
      translation: 'Buenas tardes',
    });
  });
});

describe('hablar (speak)', () => {
  it('acierta si alguna alternativa se parece lo bastante y informa el porcentaje', () => {
    const r = checkAnswer(speak, { type: 'speak', heard: ['I am fine thank you'] });
    expect(r).toMatchObject({ ok: true, pronunciation: 100 });
    const mejor = checkAnswer(speak, { type: 'speak', heard: ['banana', 'i am fine thank u'] });
    expect(mejor.ok).toBe(true);
  });

  it('falla con algo distinto e informa lo que se entendió', () => {
    expect(checkAnswer(speak, { type: 'speak', heard: ['banana split'] })).toMatchObject({
      ok: false,
      heard: 'banana split',
    });
  });

  it('un ejercicio omitido cuenta como acierto omitido', () => {
    expect(checkAnswer(speak, { type: 'speak-skipped' })).toEqual({
      ok: true,
      skipped: true,
      correctAnswer: 'I am fine, thank you',
    });
  });

  it('escrito en lugar de dicho exige más parecido (0.9)', () => {
    expect(checkAnswer(speak, { type: 'speak-typed', text: 'I am fine thank you' }).ok).toBe(true);
    expect(checkAnswer(speak, { type: 'speak-typed', text: 'I am fine thank' }).ok).toBe(false);
    expect(checkAnswer(speak, { type: 'speak-typed', text: '' }).ok).toBe(false);
  });
});

describe('respuesta de otro tipo', () => {
  it('nunca acierta ni lanza: devuelve la respuesta correcta del ejercicio', () => {
    expect(checkAnswer(mc, { type: 'write', text: 'Hello' })).toEqual({
      ok: false,
      correctAnswer: 'Hello',
    });
    expect(checkAnswer(write, { type: 'mc', optionIndex: 0 }).ok).toBe(false);
    expect(checkAnswer(listen, { type: 'speak-skipped' }).ok).toBe(false);
    expect(checkAnswer(order, { type: 'speak', heard: ['x'] }).ok).toBe(false);
  });
});

// ---- Con el contenido semilla: toda unidad debe poder resolverse bien y mal ----

function rightAnswer(e: Exercise): Answer {
  switch (e.type) {
    case 'mc':
      return { type: 'mc', optionIndex: e.answerIndex };
    case 'order':
      return { type: 'order', words: e.en.split(' ') };
    case 'write':
      return { type: 'write', text: e.en };
    case 'match':
      return { type: 'match', mistakes: 0 };
    case 'listen':
      return { type: 'listen', text: e.en };
    case 'speak':
      return { type: 'speak', heard: [e.en] };
  }
}

function wrongAnswer(e: Exercise): Answer {
  switch (e.type) {
    case 'mc':
      return { type: 'mc', optionIndex: (e.answerIndex + 1) % e.options.length };
    case 'order':
      return { type: 'order', words: [...e.en.split(' ')].reverse() };
    case 'write':
      return { type: 'write', text: 'zzz zzz zzz' };
    case 'match':
      return { type: 'match', mistakes: 3 };
    case 'listen':
      return { type: 'listen', text: 'zzz zzz zzz' };
    case 'speak':
      return { type: 'speak', heard: ['zzz'] };
  }
}

describe('contenido semilla', () => {
  const ejercicios = seedUnits.flatMap((u) => u.exercises);

  it('hay ejercicios de los seis tipos', () => {
    expect(new Set(ejercicios.map((e) => e.type)).size).toBe(6);
  });

  it.each(ejercicios.map((e) => [e.id, e] as const))(
    '%s: acepta la respuesta correcta y rechaza una incorrecta',
    (_id, e) => {
      expect(checkAnswer(e, rightAnswer(e)).ok).toBe(true);
      expect(checkAnswer(e, wrongAnswer(e)).ok).toBe(false);
      expect(checkAnswer(e, wrongAnswer(e)).correctAnswer).toBe(correctAnswerOf(e));
    },
  );
});
