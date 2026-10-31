import { describe, expect, it } from 'vitest';
import { ProgressEventSchema } from '../events';
import { visibleStreak } from '../streak';
import { foldEvents } from './fold';
import { legacyEventId, legacyImportEvent } from './legacy';
import { TEST_CONTEXT as ctx } from './test-support';

/** Estado tal como lo guarda linguapop.html (clave linguapop_v1). */
const heredado = {
  name: 'Lucía',
  xp: 340,
  gems: 120,
  hearts: 3,
  pro: true,
  goal: 80,
  done: { 0: 3, 1: 3, 2: 1 },
  chest: { 0: 1 },
  streak: 4,
  best: 9,
  lastDay: '2026-10-27',
  shield: '2026-09',
  xpHist: { '2026-10-26': 120, '2026-10-27': 60, 'no-es-dia': 5 },
  errors: ['0:3', '1:2'],
  weak: { '0:3': 2 },
  words: { weather: 2, 'x y': 1 },
  ach: { first: 1761500000000, unit1: 1761500100000, 'raro!': 5 },
  stats: {
    lessons: 7,
    correct: 62,
    total: 70,
    seconds: 900,
    perfect: 2,
    calls: 1,
    callSec: 120,
    timedBest: 11,
  },
};
const meta = { id: legacyEventId('cuenta-1'), nowMs: Date.UTC(2026, 9, 30, 12), contentVersion: 0 };

describe('importar el progreso heredado', () => {
  const evento = legacyImportEvent(heredado, meta)!;

  it('genera un evento válido para el esquema', () => {
    expect(ProgressEventSchema.safeParse(evento).success).toBe(true);
    expect(evento.type).toBe('legacy_imported@1');
  });

  it('el XP, las gemas, la racha y lo completado coinciden con la versión heredada', () => {
    const s = foldEvents([evento], ctx);
    expect(s.xp).toBe(340);
    expect(s.gems).toBe(120);
    expect(s.lessonsDone).toEqual({ 'u-saludos': 3, 'u-comida': 3, 'u-familia': 1 });
    expect(s.chestsOpened).toEqual(['u-saludos']);
    expect(s.streak).toEqual({ streak: 4, best: 9, lastDay: '2026-10-27', shieldMonth: '2026-09' });
    expect(visibleStreak(s.streak, '2026-10-27', 'pro')).toBe(4);
    expect(s.xpByDay).toEqual({ '2026-10-26': 120, '2026-10-27': 60 });
    expect(s.stats).toMatchObject({
      lessons: 7,
      correct: 62,
      total: 70,
      perfect: 2,
      calls: 1,
      callSeconds: 120,
      timedBest: 11,
    });
    expect(Object.keys(s.achievements).sort()).toEqual(['first', 'unit1']);
    expect(s.words).toEqual({ weather: 2, 'x y': 1 });
    expect(s.settings).toMatchObject({ displayName: 'Lucía', dailyGoalXp: 80 });
  });

  it('importarlo dos veces no duplica nada', () => {
    const otro = legacyImportEvent(heredado, meta)!;
    expect(foldEvents([evento, otro], ctx)).toEqual(foldEvents([evento], ctx));
  });

  it('se suma al progreso que ya había en la app sin pisarlo', () => {
    const antes = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'session_completed@1' as const,
      occurredAt: '2026-10-29T12:00:00.000Z',
      contentVersion: 0,
      payload: {
        mode: 'lesson' as const,
        unitId: 'u-saludos',
        lessonId: 'u-saludos-l1',
        correct: 10,
        wrong: 0,
        answered: 10,
        durationSec: 60,
        outOfHearts: false,
      },
    };
    const solo = foldEvents([antes], ctx);
    const junto = foldEvents([antes, evento], ctx);
    expect(junto.xp).toBe(solo.xp + 340);
    expect(junto.streak.lastDay).toBe('2026-10-29'); // la racha más reciente es la de la app
    expect(junto.streak.best).toBeGreaterThanOrEqual(9);
    expect(foldEvents([evento, antes], ctx)).toEqual(junto);
  });

  it('descarta lo ilegible y no importa si no hay progreso', () => {
    expect(legacyImportEvent(null, meta)).toBeNull();
    expect(legacyImportEvent('texto', meta)).toBeNull();
    expect(legacyImportEvent({}, meta)).toBeNull();
    expect(legacyImportEvent({ xp: 0, gems: 50, stats: {}, done: {} }, meta)).toBeNull();
    const raro = legacyImportEvent(
      { xp: -5, stats: { lessons: 2 }, lastDay: 'ayer', done: { 0: 99 } },
      meta,
    )!;
    expect(ProgressEventSchema.safeParse(raro).success).toBe(true);
    expect(raro.payload.xp).toBe(0);
    expect(raro.payload.lessonsDone).toEqual({ 'u-saludos': 3 });
    expect(raro.payload.streak.lastDay).toBe('');
  });

  it('el id depende solo de la cuenta y es un UUID válido', () => {
    expect(legacyEventId('cuenta-1')).toBe(legacyEventId('cuenta-1'));
    expect(legacyEventId('cuenta-1')).not.toBe(legacyEventId('cuenta-2'));
    expect(ProgressEventSchema.safeParse({ ...evento, id: legacyEventId('otra') }).success).toBe(
      true,
    );
  });
});
