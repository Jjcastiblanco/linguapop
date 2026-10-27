import { describe, expect, it } from 'vitest';
import { AchievementSchema, DialogueTopicSchema, ExerciseSchema, UnitSchema } from './schema';

const mc = {
  id: 'u-demo-e01',
  type: 'mc',
  prompt: '¿Cómo se dice "Hola"?',
  options: [
    { emoji: '👋', text: 'Hello' },
    { emoji: '🌙', text: 'Good night' },
  ],
  answerIndex: 0,
};

describe('ejercicios', () => {
  it('acepta un ejemplo válido de cada tipo', () => {
    const ejemplos = [
      mc,
      {
        id: 'u-demo-e02',
        type: 'order',
        es: 'Me llamo Ana',
        en: 'My name is Ana',
        extraWords: ['am'],
      },
      { id: 'u-demo-e03', type: 'write', es: 'Buenos días', en: 'Good morning', alternatives: [] },
      {
        id: 'u-demo-e04',
        type: 'match',
        pairs: [
          { es: 'Hola', en: 'Hello' },
          { es: 'Adiós', en: 'Goodbye' },
        ],
      },
      { id: 'u-demo-e05', type: 'listen', en: 'Nice to meet you', es: 'Mucho gusto' },
      { id: 'u-demo-e06', type: 'speak', en: 'I am fine', es: 'Estoy bien', tip: 'Fine = bien.' },
    ];
    for (const e of ejemplos) expect(ExerciseSchema.safeParse(e).success, e.type).toBe(true);
  });

  it.each([
    ['tipo desconocido', { ...mc, type: 'dibujar' }],
    ['respuesta fuera de las opciones', { ...mc, answerIndex: 5 }],
    ['una sola opción', { ...mc, options: [{ emoji: '👋', text: 'Hello' }] }],
    ['texto de opción vacío', { ...mc, options: [{ emoji: '👋', text: ' ' }, mc.options[1]] }],
    ['id con mayúsculas', { ...mc, id: 'U-Demo' }],
    [
      'pares repetidos',
      {
        id: 'u-demo-e04',
        type: 'match',
        pairs: [
          { es: 'Hola', en: 'Hello' },
          { es: 'Hola', en: 'Hi' },
        ],
      },
    ],
    [
      'falta el inglés en escribir',
      { id: 'u-demo-e03', type: 'write', es: 'Hola', alternatives: [] },
    ],
  ])('rechaza: %s', (_nombre, ejercicio) => {
    expect(ExerciseSchema.safeParse(ejercicio).success).toBe(false);
  });
});

function unidadDe(n: number) {
  return {
    id: 'u-demo',
    name: 'Demo',
    emoji: '👋',
    color: '#ff8a1f',
    colorDark: '#c76200',
    description: 'Unidad de prueba',
    exercises: Array.from({ length: n }, (_, i) => ({
      id: `u-demo-e${String(i + 1).padStart(2, '0')}`,
      type: 'listen',
      en: `Phrase ${i}`,
      es: `Frase ${i}`,
    })),
    lessons: [{ id: 'u-demo-l1', exerciseIds: ['u-demo-e01', 'u-demo-e02'] }],
  };
}

describe('unidades', () => {
  it('acepta una unidad con 15 ejercicios y lecciones que apuntan a ejercicios existentes', () => {
    expect(UnitSchema.safeParse(unidadDe(15)).success).toBe(true);
  });

  it('rechaza una unidad con menos de 15 ejercicios', () => {
    expect(UnitSchema.safeParse(unidadDe(14)).success).toBe(false);
  });

  it('rechaza una lección que usa un ejercicio inexistente', () => {
    const u = unidadDe(15);
    u.lessons[0]!.exerciseIds.push('u-demo-e99');
    expect(UnitSchema.safeParse(u).success).toBe(false);
  });

  it('rechaza ids de ejercicio repetidos o de otra unidad', () => {
    const repetido = unidadDe(15);
    repetido.exercises[1]!.id = 'u-demo-e01';
    expect(UnitSchema.safeParse(repetido).success).toBe(false);
    const ajeno = unidadDe(15);
    ajeno.exercises[0]!.id = 'u-otra-e01';
    expect(UnitSchema.safeParse(ajeno).success).toBe(false);
  });
});

describe('temas de Nova y logros', () => {
  const turno = { nova: 'Hi!', accepted: ['hello'], hint: 'Di: "Hello".', comment: 'Nice.' };

  it('acepta un tema con 8 turnos y rechaza uno con 7', () => {
    const tema = (n: number) => ({
      id: 't-presentarse',
      unitId: 'u-saludos',
      title: 'Presentarse',
      emoji: '🙋',
      intro: 'Hey!',
      outro: 'Bye!',
      turns: Array.from({ length: n }, () => turno),
    });
    expect(DialogueTopicSchema.safeParse(tema(8)).success).toBe(true);
    expect(DialogueTopicSchema.safeParse(tema(7)).success).toBe(false);
  });

  it('las condiciones de logro usan solo estadísticas de la lista cerrada', () => {
    const logro = (stat: string) => ({
      id: 'a-demo',
      icon: '🎯',
      name: 'Demo',
      description: 'Demo',
      condition: { stat, atLeast: 3 },
    });
    expect(AchievementSchema.safeParse(logro('streak')).success).toBe(true);
    expect(AchievementSchema.safeParse(logro('horasDeSueno')).success).toBe(false);
  });
});
