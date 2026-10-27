import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, ProgressEventSchema } from './schema';

const base = {
  id: '3f2b8c4e-9a1d-4e6f-8b7a-1c2d3e4f5a6b',
  occurredAt: '2026-10-27T15:30:00.000Z',
  contentVersion: 3,
};

const validos = {
  'exercise_answered@1': { exerciseId: 'u-saludos-e01', correct: true, mode: 'lesson' },
  'session_completed@1': {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: 'u-saludos-l1',
    correct: 9,
    wrong: 1,
    answered: 10,
    durationSec: 95,
    outOfHearts: false,
  },
  'chest_opened@1': { unitId: 'u-saludos', gems: 41, xp: 20 },
  'call_completed@1': {
    topicId: 't-presentarse',
    durationSec: 240,
    completed: true,
    firstTry: 5,
    later: 2,
    gaveUp: 1,
    weakWords: ['thank'],
    aiExchanges: 0,
  },
  'settings_changed@1': { dailyGoalXp: 100 },
  'purchase@1': { item: 'hearts', costGems: 30 },
} as const;

const evento = (type: string, payload: unknown, extra: Record<string, unknown> = {}) => ({
  ...base,
  type,
  payload,
  ...extra,
});

describe('catálogo de eventos', () => {
  it('declara seis eventos, todos con versión 1', () => {
    expect([...EVENT_TYPES].sort()).toEqual(Object.keys(validos).sort());
    for (const t of EVENT_TYPES) expect(t.endsWith('@1')).toBe(true);
  });

  it.each(Object.entries(validos))('acepta un evento válido: %s', (type, payload) => {
    expect(ProgressEventSchema.safeParse(evento(type, payload)).success).toBe(true);
  });

  it('acepta solo algunos campos en settings_changed y pasa por alto el resto', () => {
    expect(
      ProgressEventSchema.safeParse(evento('settings_changed@1', { plan: 'pro' })).success,
    ).toBe(true);
    expect(
      ProgressEventSchema.safeParse(evento('settings_changed@1', { timeZone: 'America/Bogota' }))
        .success,
    ).toBe(true);
  });

  it.each([
    ['versión desconocida', evento('exercise_answered@2', validos['exercise_answered@1'])],
    ['tipo desconocido', evento('level_up@1', { level: 2 })],
    ['tipo sin versión', evento('purchase', validos['purchase@1'])],
    ['id que no es UUID', evento('purchase@1', validos['purchase@1'], { id: 'abc' })],
    ['fecha inválida', evento('purchase@1', validos['purchase@1'], { occurredAt: 'ayer' })],
    [
      'fecha sin zona horaria',
      evento('purchase@1', validos['purchase@1'], { occurredAt: '2026-10-27T15:30:00' }),
    ],
    [
      'falta la versión del contenido',
      { ...evento('purchase@1', validos['purchase@1']), contentVersion: undefined },
    ],
    [
      'versión de contenido negativa',
      evento('purchase@1', validos['purchase@1'], { contentVersion: -1 }),
    ],
    [
      'falta un campo del payload',
      evento('exercise_answered@1', { exerciseId: 'u-saludos-e01', mode: 'lesson' }),
    ],
    [
      'modo desconocido',
      evento('exercise_answered@1', { ...validos['exercise_answered@1'], mode: 'competencia' }),
    ],
    [
      'número negativo',
      evento('session_completed@1', { ...validos['session_completed@1'], correct: -1 }),
    ],
    [
      'decimal donde va un entero',
      evento('chest_opened@1', { unitId: 'u-saludos', gems: 4.5, xp: 20 }),
    ],
    ['artículo de tienda desconocido', evento('purchase@1', { item: 'diamantes', costGems: 10 })],
    ['settings_changed vacío', evento('settings_changed@1', {})],
    ['plan desconocido', evento('settings_changed@1', { plan: 'oro' })],
  ])('rechaza: %s', (_nombre, e) => {
    expect(ProgressEventSchema.safeParse(e).success).toBe(false);
  });

  it('el sobre y el tipo se conservan tras validar', () => {
    const e = ProgressEventSchema.parse(evento('purchase@1', validos['purchase@1']));
    expect(e.id).toBe(base.id);
    expect(e.type).toBe('purchase@1');
    expect(e.contentVersion).toBe(3);
  });
});
