import { describe, expect, it } from 'vitest';
import { addDays, localHour, weekday } from '../streak';
import { hashString } from './bots';
import { leagueTable, leagueTier, weekStart, weekXp, type LeagueInput } from './table';

// 2026-10-26 es lunes.
const base: LeagueInput = {
  day: '2026-10-28',
  hour: 12,
  xpByDay: {},
  totalXp: 0,
  playerName: 'Explorador',
};
const yo = (l: ReturnType<typeof leagueTable>) => l.rows.find((r) => r.me)!;

describe('calendario', () => {
  it('weekday cuenta desde el lunes', () => {
    expect(weekday('2026-10-26')).toBe(0);
    expect(weekday('2026-11-01')).toBe(6);
    expect(weekday('1970-01-01')).toBe(3);
    expect(weekday('1969-12-31')).toBe(2);
    expect(weekday('malo')).toBeNull();
  });

  it('addDays cruza meses, años y bisiestos', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-10-28', 0)).toBe('2026-10-28');
    expect(addDays('malo', 3)).toBe('malo');
  });

  it('localHour respeta la zona horaria', () => {
    const ms = Date.UTC(2026, 9, 28, 3, 0, 0);
    expect(localHour(ms, 'UTC')).toBe(3);
    expect(localHour(ms, 'America/Bogota')).toBe(22);
    expect(localHour(ms, 'no/existe')).toBe(3);
  });

  it('weekStart es el lunes de la semana', () => {
    expect(weekStart('2026-10-28')).toBe('2026-10-26');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
  });
});

describe('liga simulada', () => {
  it('hashString da los mismos valores que la versión heredada', () => {
    expect(hashString('')).toBe(2166136261);
    expect(hashString('a')).toBe(3826002220);
  });

  it('con los mismos datos da siempre la misma tabla de 30 filas', () => {
    const a = leagueTable(base);
    expect(a.rows).toHaveLength(30);
    expect(leagueTable({ ...base })).toEqual(a);
  });

  it('otra semana cambia el XP de los bots', () => {
    const esta = leagueTable(base)
      .rows.filter((r) => !r.me)
      .map((r) => r.xp);
    const otra = leagueTable({ ...base, day: '2026-11-04' })
      .rows.filter((r) => !r.me)
      .map((r) => r.xp);
    expect(otra).not.toEqual(esta);
  });

  it('sin XP el estudiante queda en la zona de descenso', () => {
    const me = yo(leagueTable(base));
    expect(me.xp).toBe(0);
    expect(me.rank).toBeGreaterThanOrEqual(26);
    expect(me.zone).toBe('demotion');
  });

  it('con mucho XP semanal el estudiante es el primero y sube', () => {
    const l = leagueTable({ ...base, xpByDay: { '2026-10-27': 5000 } });
    expect(l.rows[0]).toMatchObject({ me: true, rank: 1, zone: 'promotion' });
  });

  it('el XP de otra semana no cuenta', () => {
    expect(
      weekXp(
        { '2026-10-25': 90, '2026-10-26': 10, '2026-11-01': 5, '2026-11-02': 70 },
        '2026-10-29',
      ),
    ).toBe(15);
  });

  it('en un empate el estudiante queda delante del bot', () => {
    const bot = leagueTable(base).rows.find((r) => !r.me)!;
    const l = leagueTable({ ...base, xpByDay: { '2026-10-26': bot.xp } });
    const mine = yo(l);
    const botRow = l.rows.find((r) => r.name === bot.name)!;
    expect(mine.rank).toBeLessThan(botRow.rank);
  });

  it('marca 10 de ascenso, 15 seguras y 5 de descenso', () => {
    const zonas = leagueTable(base).rows.map((r) => r.zone);
    expect(zonas.filter((z) => z === 'promotion')).toHaveLength(10);
    expect(zonas.filter((z) => z === 'safe')).toHaveLength(15);
    expect(zonas.filter((z) => z === 'demotion')).toHaveLength(5);
    expect(zonas[9]).toBe('promotion');
    expect(zonas[10]).toBe('safe');
    expect(zonas[24]).toBe('safe');
    expect(zonas[25]).toBe('demotion');
  });

  it.each([
    [0, 'bronze'],
    [499, 'bronze'],
    [500, 'silver'],
    [1499, 'silver'],
    [1500, 'gold'],
  ] as const)('con %s XP total la liga es %s', (xp, tier) => {
    expect(leagueTier(xp)).toBe(tier);
    expect(leagueTable({ ...base, totalXp: xp }).tier).toBe(tier);
  });

  it.each([
    ['2026-10-26', 7],
    ['2026-10-28', 5],
    ['2026-11-01', 1],
  ])('el %s quedan %s días', (day, left) => {
    expect(leagueTable({ ...base, day }).daysLeft).toBe(left);
  });
});
