import { describe, expect, it } from 'vitest';
import racha from '../../fixtures/racha.json';
import { addDays, dayKey, daysBetween, monthKey, weekKey } from './day';
import {
  INITIAL_STREAK,
  registerActivity,
  visibleStreak,
  type StreakPlan,
  type StreakState,
} from './streak';

/** Estado con el día de gracia de esa semana ya gastado: deja solo el protector, como en la versión heredada. */
const graciaGastada = (lastDay: string) => ({ graceWeek: weekKey(addDays(lastDay, 1)) });

describe('racha: casos de referencia de la versión heredada (con la gracia semanal ya gastada)', () => {
  it.each(racha.casos)('$nombre', (c) => {
    const plan: StreakPlan = c.estado.pro ? 'pro' : 'free';
    const antes: StreakState = {
      streak: c.estado.streak,
      best: c.estado.best,
      lastDay: c.estado.lastDay,
      shieldMonth: c.estado.shield,
      ...graciaGastada(c.estado.lastDay),
    };
    expect(visibleStreak(antes, c.hoy, plan)).toBe(c.rachaVisibleAntes);
    const { state } = registerActivity(antes, c.hoy, plan);
    expect(state).toMatchObject({
      streak: c.esperado.streak,
      best: c.esperado.best,
      lastDay: c.esperado.lastDay,
      shieldMonth: c.esperado.shield,
    });
  });
});

describe('día de gracia semanal', () => {
  const hoy = '2026-10-27'; // martes de la semana 2026-W44; el día perdido fue el lunes 26

  it('en todos los planes, perder un solo día no rompe la racha y no gasta el protector', () => {
    for (const plan of ['free', 'pro'] as const) {
      const antes = { streak: 4, best: 4, lastDay: '2026-10-25', shieldMonth: '' };
      expect(visibleStreak(antes, hoy, plan)).toBe(4);
      const r = registerActivity(antes, hoy, plan);
      expect(r.state).toMatchObject({
        streak: 5,
        graceWeek: weekKey('2026-10-26'),
        shieldMonth: '',
      });
      expect(r.shieldUsed).toBe(false);
    }
  });

  it('solo una vez por semana: la segunda falta de la misma semana rompe la racha en el plan gratis', () => {
    const gastada = {
      streak: 5,
      best: 5,
      lastDay: '2026-10-27',
      shieldMonth: '',
      graceWeek: weekKey('2026-10-26'),
    };
    // el jueves 29 se perdió el miércoles 28, de la misma semana: la gracia ya se usó
    expect(visibleStreak(gastada, '2026-10-29', 'free')).toBe(0);
    expect(registerActivity(gastada, '2026-10-29', 'free').state.streak).toBe(1);
  });

  it('la gracia se renueva al empezar otra semana', () => {
    // gastada en W44 (día perdido lunes 26); el domingo 1 de nov. se vuelve a jugar y el lunes 2
    // (W45) se pierde otro día: la gracia de esa semana nueva está libre
    const gastada = {
      streak: 5,
      best: 5,
      lastDay: '2026-11-01',
      shieldMonth: '',
      graceWeek: weekKey('2026-10-26'),
    };
    const r = registerActivity(gastada, '2026-11-03', 'free');
    expect(r.state.streak).toBe(6);
    expect(r.state.graceWeek).toBe(weekKey('2026-11-02'));
  });

  it('un último día inválido no tiene gracia', () => {
    const r = registerActivity({ streak: 9, best: 9, lastDay: '', shieldMonth: '' }, hoy, 'free');
    expect(r.state.streak).toBe(1);
    expect(
      visibleStreak({ streak: 9, best: 9, lastDay: 'ayer', shieldMonth: '' }, hoy, 'pro'),
    ).toBe(0);
  });

  it('con la gracia gastada, PRO sigue teniendo su protector mensual', () => {
    const gastada = {
      streak: 5,
      best: 5,
      lastDay: '2026-10-27',
      shieldMonth: '',
      graceWeek: weekKey('2026-10-26'),
    };
    const r = registerActivity(gastada, '2026-10-29', 'pro');
    expect(r.shieldUsed).toBe(true);
    expect(r.state.streak).toBe(6);
    expect(r.state.shieldMonth).toBe('2026-10');
  });

  it('dos días perdidos siguen rompiendo la racha aunque haya gracia', () => {
    const antes = { streak: 4, best: 4, lastDay: '2026-10-24', shieldMonth: '' };
    expect(visibleStreak(antes, hoy, 'free')).toBe(0);
    expect(registerActivity(antes, hoy, 'free').state.streak).toBe(1);
  });
});

describe('registerActivity', () => {
  const hoy = '2026-10-27';

  it('indica cuándo se usó el protector', () => {
    const r = registerActivity(
      {
        streak: 4,
        best: 4,
        lastDay: '2026-10-25',
        shieldMonth: '',
        ...graciaGastada('2026-10-25'),
      },
      hoy,
      'pro',
    );
    expect(r.shieldUsed).toBe(true);
    expect(r.state.shieldMonth).toBe('2026-10');
    const sin = registerActivity(
      { streak: 4, best: 4, lastDay: '2026-10-26', shieldMonth: '' },
      hoy,
      'pro',
    );
    expect(sin.shieldUsed).toBe(false);
  });

  it('no usa el protector dos veces en el mismo mes ni en el plan gratis', () => {
    const usado = registerActivity(
      {
        streak: 4,
        best: 6,
        lastDay: '2026-10-25',
        shieldMonth: '2026-10',
        ...graciaGastada('2026-10-25'),
      },
      hoy,
      'pro',
    );
    expect(usado.state.streak).toBe(1);
    const gratis = registerActivity(
      {
        streak: 4,
        best: 4,
        lastDay: '2026-10-25',
        shieldMonth: '',
        ...graciaGastada('2026-10-25'),
      },
      hoy,
      'free',
    );
    expect(gratis.state.streak).toBe(1);
  });

  it('actividad el mismo día no cambia nada y devuelve el mismo estado', () => {
    const s = { streak: 3, best: 3, lastDay: hoy, shieldMonth: '' };
    expect(registerActivity(s, hoy, 'pro').state).toBe(s);
  });

  it('si el día retrocede, la racha y el último día no cambian', () => {
    const s = { streak: 5, best: 7, lastDay: hoy, shieldMonth: '' };
    expect(registerActivity(s, '2026-10-26', 'free').state).toBe(s);
    expect(registerActivity(s, '2026-10-20', 'pro').state).toBe(s);
  });

  it('el estado inicial empieza la racha en 1', () => {
    expect(registerActivity(INITIAL_STREAK, hoy, 'free').state).toMatchObject({
      streak: 1,
      best: 1,
      lastDay: hoy,
    });
  });

  it('un último día corrupto reinicia la racha en vez de fallar', () => {
    const r = registerActivity(
      { streak: 9, best: 9, lastDay: 'ayer', shieldMonth: '' },
      hoy,
      'pro',
    );
    expect(r.state.streak).toBe(1);
    expect(
      visibleStreak({ streak: 9, best: 9, lastDay: 'ayer', shieldMonth: '' }, hoy, 'pro'),
    ).toBe(0);
  });

  it('nunca modifica el estado recibido', () => {
    const s = Object.freeze({ streak: 2, best: 2, lastDay: '2026-10-26', shieldMonth: '' });
    expect(() => registerActivity(s, hoy, 'pro')).not.toThrow();
    expect(s.streak).toBe(2);
  });
});

describe('días calendario', () => {
  it('cuenta días entre fechas, también en cambio de mes, año y bisiesto', () => {
    expect(daysBetween('2026-10-26', '2026-10-27')).toBe(1);
    expect(daysBetween('2026-10-30', '2026-11-01')).toBe(2);
    expect(daysBetween('2026-12-30', '2027-01-01')).toBe(2);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2026-10-27', '2026-10-27')).toBe(0);
    expect(daysBetween('2026-10-27', '2026-10-20')).toBe(-7);
  });

  it('devuelve nulo ante fechas inválidas', () => {
    expect(daysBetween('', '2026-10-27')).toBeNull();
    expect(daysBetween('2026-13-01', '2026-10-27')).toBeNull();
    expect(daysBetween('2026-10-27', '27/10/2026')).toBeNull();
  });

  it('monthKey devuelve año y mes', () => {
    expect(monthKey('2026-10-27')).toBe('2026-10');
  });

  it('dayKey usa la zona horaria del usuario y cae en UTC si no es válida', () => {
    const instante = Date.UTC(2026, 9, 28, 2, 30, 0); // 2026-10-28 02:30 UTC
    expect(dayKey(instante, 'UTC')).toBe('2026-10-28');
    expect(dayKey(instante, 'America/Bogota')).toBe('2026-10-27'); // UTC-5: aún es el 27
    expect(dayKey(instante, 'Asia/Tokyo')).toBe('2026-10-28'); // UTC+9
    expect(dayKey(instante, 'Zona/Inexistente')).toBe('2026-10-28');
  });
});
