import { describe, expect, it } from 'vitest';
import { recentXp } from './recent-xp';

describe('recentXp', () => {
  it('devuelve 7 días del más antiguo a hoy con el XP de cada uno', () => {
    const r = recentXp({ '2026-10-28': 40, '2026-10-24': 15, '2026-10-20': 99 }, '2026-10-28');
    expect(r.map((d) => d.day)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ]);
    expect(r.map((d) => d.xp)).toEqual([0, 0, 15, 0, 0, 0, 40]);
    expect(r.at(-1)!.weekday).toBe(2); // 2026-10-28 es miércoles
  });

  it('cruza el cambio de mes y acepta otro número de días', () => {
    const r = recentXp({ '2026-10-31': 5, '2026-11-01': 7 }, '2026-11-01', 3);
    expect(r.map((d) => [d.day, d.xp])).toEqual([
      ['2026-10-30', 0],
      ['2026-10-31', 5],
      ['2026-11-01', 7],
    ]);
  });
});
