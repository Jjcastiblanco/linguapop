import { describe, expect, it } from 'vitest';
import puntuacion from '../../fixtures/puntuacion.json';
import {
  ACHIEVEMENT_GEM_BONUS,
  dailyGoalBonus,
  scoreSession,
  type SessionScoreInput,
} from './index';

// Los escenarios de referencia salen de linguapop.html: guardan el estado antes y después de
// terminar una sesión. Aquí se comprueba lo que las reglas de puntuación explican de ese cambio.

describe('puntuación: escenarios de referencia de la versión heredada', () => {
  it.each(puntuacion.escenarios)('$nombre', (e) => {
    const s = e.sesion;
    const score = scoreSession({
      mode: s.mode as SessionScoreInput['mode'],
      correct: s.correct,
      wrong: s.wrong,
      answered: s.answered,
      outOfHearts: s.outOfHearts,
      isReplay: s.mode === 'lesson' && s.lesson < (e.estadoInicial.done[s.unit] ?? 0),
    });

    // El XP no lleva bonos: coincide exactamente.
    expect(e.esperado.xp - e.estadoInicial.xp).toBe(score.xp);

    // Las gemas son el premio de la sesión más los bonos: 5 por cada logro nuevo y 10 por la meta.
    const logrosNuevos = e.esperado.ach.filter(
      (a) => !(e.estadoInicial.ach as string[]).includes(a),
    ).length;
    const bono = dailyGoalBonus(e.estadoInicial.xpHoy, score.xp, e.estadoInicial.goal);
    expect(e.esperado.gems - e.estadoInicial.gems).toBe(
      score.gems + bono + logrosNuevos * ACHIEVEMENT_GEM_BONUS,
    );
  });

  it('cubre los cinco modos y el plan gratis', () => {
    const modos = new Set(puntuacion.escenarios.map((e) => e.sesion.mode));
    expect([...modos].sort()).toEqual(['lesson', 'practice', 'review', 'test', 'timed']);
    expect(puntuacion.escenarios.some((e) => e.sesion.outOfHearts)).toBe(true);
  });
});

const lesson = (o: Partial<SessionScoreInput> = {}): SessionScoreInput => ({
  mode: 'lesson',
  correct: 10,
  wrong: 0,
  answered: 10,
  outOfHearts: false,
  ...o,
});

describe('scoreSession', () => {
  it('lección perfecta: 10 por acierto, 20 de bono y 10 gemas', () => {
    expect(scoreSession(lesson())).toEqual({
      xp: 120,
      gems: 10,
      accuracy: 100,
      perfect: true,
      passed: null,
    });
  });

  it('lección con errores: 10 por acierto y 5 gemas', () => {
    const s = scoreSession(lesson({ correct: 7, wrong: 3 }));
    expect(s).toMatchObject({ xp: 70, gems: 5, accuracy: 70, perfect: false });
  });

  it('lección repetida: mitad de XP y sin gemas', () => {
    expect(scoreSession(lesson({ isReplay: true }))).toMatchObject({ xp: 60, gems: 0 });
  });

  it('repaso y práctica: 5 por acierto y 2 gemas', () => {
    expect(scoreSession(lesson({ mode: 'review', correct: 8, wrong: 2 }))).toMatchObject({
      xp: 40,
      gems: 2,
    });
    expect(scoreSession(lesson({ mode: 'practice' }))).toMatchObject({ xp: 50, gems: 2 });
  });

  it('desafío: 5 por acierto y una gema por cada 3, nunca perfecto', () => {
    const s = scoreSession(lesson({ mode: 'timed', correct: 12, wrong: 0, answered: 12 }));
    expect(s).toMatchObject({ xp: 60, gems: 4, perfect: false });
    expect(scoreSession(lesson({ mode: 'timed', correct: 2, answered: 7, wrong: 5 })).gems).toBe(0);
  });

  it('prueba de nivel: aprueba con 80 por ciento o más', () => {
    const aprobada = scoreSession(lesson({ mode: 'test', correct: 10, wrong: 2, answered: 12 }));
    expect(aprobada).toMatchObject({ xp: 40, gems: 25, passed: true, accuracy: 83 });
    const limite = scoreSession(lesson({ mode: 'test', correct: 8, wrong: 2, answered: 10 }));
    expect(limite.passed).toBe(true);
    const reprobada = scoreSession(lesson({ mode: 'test', correct: 9, wrong: 3, answered: 12 }));
    expect(reprobada).toMatchObject({ xp: 0, gems: 0, passed: false, accuracy: 75 });
  });

  it('sin vidas: 2 de XP por acierto, sin gemas y sin resultado de prueba', () => {
    const s = scoreSession(lesson({ correct: 4, wrong: 1, answered: 5, outOfHearts: true }));
    expect(s).toMatchObject({ xp: 8, gems: 0, perfect: false, passed: null });
    expect(
      scoreSession(lesson({ mode: 'test', correct: 9, answered: 9, outOfHearts: true })).passed,
    ).toBeNull();
  });

  it('sin respuestas: precisión 0 y nunca perfecta', () => {
    const s = scoreSession(lesson({ correct: 0, wrong: 0, answered: 0 }));
    expect(s).toMatchObject({ xp: 0, accuracy: 0, perfect: false });
  });
});

describe('dailyGoalBonus', () => {
  it('da 10 gemas solo al cruzar la meta', () => {
    expect(dailyGoalBonus(40, 20, 50)).toBe(10);
    expect(dailyGoalBonus(40, 10, 50)).toBe(10);
    expect(dailyGoalBonus(40, 9, 50)).toBe(0);
  });

  it('no repite el bono si la meta ya estaba cumplida', () => {
    expect(dailyGoalBonus(50, 20, 50)).toBe(0);
    expect(dailyGoalBonus(80, 20, 50)).toBe(0);
  });
});
