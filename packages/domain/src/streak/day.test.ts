import { describe, expect, it } from 'vitest';
import { weekKey } from './day';

describe('weekKey', () => {
  it('es la semana ISO: de lunes a domingo, del año de su jueves', () => {
    expect(weekKey('2026-10-26')).toBe('2026-W44');
    expect(weekKey('2026-11-01')).toBe('2026-W44');
    expect(weekKey('2026-11-02')).toBe('2026-W45');
    expect(weekKey('2026-01-01')).toBe('2026-W01'); // jueves
    expect(weekKey('2021-01-03')).toBe('2020-W53'); // domingo del cierre de 2020
    expect(weekKey('2024-12-30')).toBe('2025-W01'); // lunes que ya es del año siguiente
  });

  it('un día inválido da cadena vacía', () => {
    expect(weekKey('ayer')).toBe('');
  });
});
