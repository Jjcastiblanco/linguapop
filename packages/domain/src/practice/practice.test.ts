import { seedCourse, type Exercise } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { completeEvent } from '../events';
import type { Answer } from '../exercises';
import {
  currentExercise,
  remainingSec,
  startLesson,
  stepLesson,
  type LessonEffect,
} from '../lesson';
import { foldEvents, initialProgress, type ProgressState } from '../progress';
import { TEST_CONTEXT } from '../progress/test-support';
import {
  PERSONALIZED_SIZE,
  PLACEMENT_SIZE,
  REVIEW_SIZE,
  TIMED_SECONDS,
  TIMED_SIZE,
  buildPersonalizedList,
  buildPlacementList,
  buildReviewList,
  buildTimedList,
  practiceConfig,
  currentUnitId,
  isUnitComplete,
  isUnitUnlocked,
  type PracticeInput,
} from './index';

const units = seedCourse.units;
const TODAY = '2026-10-27';
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);

/** Azar repetible (congruencial lineal) para que las pruebas no dependan de Math.random. */
function azar(semilla = 7) {
  let s = semilla;
  return { next: () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 };
}

const progreso = (o: Partial<ProgressState> = {}): ProgressState => ({
  ...initialProgress(),
  ...o,
});
const entrada = (p: ProgressState, semilla = 7): PracticeInput & { progress: ProgressState } => ({
  units,
  progress: p,
  random: azar(semilla),
});
const hechas = (n: number) => Object.fromEntries(units.map((u, i) => [u.id, i < n ? 3 : 0]));
const ids = (l: Exercise[]) => l.map((e) => e.id);

describe('unidades abiertas', () => {
  it('la primera siempre está abierta y cada una abre al completar la anterior', () => {
    expect(isUnitUnlocked(units, {}, 'u-saludos')).toBe(true);
    expect(isUnitUnlocked(units, {}, 'u-comida')).toBe(false);
    expect(isUnitUnlocked(units, { 'u-saludos': 2 }, 'u-comida')).toBe(false);
    expect(isUnitUnlocked(units, { 'u-saludos': 3 }, 'u-comida')).toBe(true);
    expect(isUnitUnlocked(units, { 'u-saludos': 3 }, 'u-familia')).toBe(false);
    expect(isUnitUnlocked(units, {}, 'u-no-existe')).toBe(false);
  });

  it('una unidad está completa con todas sus lecciones', () => {
    expect(isUnitComplete(units[0]!, { 'u-saludos': 3 })).toBe(true);
    expect(isUnitComplete(units[0]!, { 'u-saludos': 2 })).toBe(false);
  });

  it('la unidad actual es la primera sin completar, o la última si están todas', () => {
    expect(currentUnitId(units, {})).toBe('u-saludos');
    expect(currentUnitId(units, hechas(2))).toBe('u-familia');
    expect(currentUnitId(units, hechas(5))).toBe('u-trabajo');
  });
});

describe('repaso de errores', () => {
  it('sin errores ni palabras no hay nada que repasar', () => {
    expect(buildReviewList(entrada(progreso()))).toEqual([]);
  });

  it('arma la lista con los ejercicios fallados y los ignora si ya no existen', () => {
    const p = progreso({ errors: ['u-saludos-e01', 'u-comida-e03', 'u-ya-no-existe-e01'] });
    expect(ids(buildReviewList(entrada(p))).sort()).toEqual(['u-comida-e03', 'u-saludos-e01']);
  });

  it('cada palabra a mejorar aporta un ejercicio de decirla y otro de escucharla, con id w-palabra', () => {
    const lista = buildReviewList(entrada(progreso({ words: { cheese: 2 } })));
    expect(lista.map((e) => e.type).sort()).toEqual(['listen', 'speak']);
    expect(ids(lista)).toEqual(['w-cheese', 'w-cheese']);
    expect(lista.every((e) => e.type !== 'mc' && e.type !== 'match' && e.en === 'cheese')).toBe(
      true,
    );
  });

  it('se limita a 12 ejercicios', () => {
    const errores = units[0]!.exercises.concat(units[1]!.exercises).map((e) => e.id);
    expect(buildReviewList(entrada(progreso({ errors: errores })))).toHaveLength(REVIEW_SIZE);
  });

  it('no muestra ejercicios retirados', () => {
    const retirado = units.map((u) => ({
      ...u,
      exercises: u.exercises.map((e) => (e.id === 'u-saludos-e01' ? { ...e, retired: true } : e)),
    }));
    const lista = buildReviewList({
      units: retirado,
      progress: progreso({ errors: ['u-saludos-e01', 'u-saludos-e02'] }),
      random: azar(),
    });
    expect(ids(lista)).toEqual(['u-saludos-e02']);
  });
});

describe('práctica personalizada', () => {
  it('pone primero lo más débil y completa hasta 10 con ejercicios de las unidades abiertas', () => {
    const weak = { 'u-saludos-e05': 1, 'u-saludos-e02': 4, 'u-saludos-e09': 2 };
    const lista = buildPersonalizedList(entrada(progreso({ weak })));
    expect(lista).toHaveLength(PERSONALIZED_SIZE);
    expect(ids(lista)).toEqual(
      expect.arrayContaining(['u-saludos-e02', 'u-saludos-e09', 'u-saludos-e05']),
    );
    expect(new Set(ids(lista)).size).toBe(lista.length);
  });

  it('solo toma de las unidades abiertas y nunca repite', () => {
    const lista = buildPersonalizedList(entrada(progreso()));
    expect(lista).toHaveLength(10);
    expect(lista.every((e) => e.id.startsWith('u-saludos-'))).toBe(true);
    const abierta = buildPersonalizedList(entrada(progreso({ lessonsDone: hechas(2) }), 99));
    expect(new Set(ids(abierta)).size).toBe(10);
    expect(abierta.every((e) => /^u-(saludos|comida|familia)-/.test(e.id))).toBe(true);
  });

  it('incluye hasta 3 palabras a mejorar y pone como máximo 10 debilidades', () => {
    const muchasDebiles = Object.fromEntries(
      units[0]!.exercises
        .concat(units[1]!.exercises)
        .slice(0, 14)
        .map((e, i) => [e.id, 20 - i]),
    );
    const lista = buildPersonalizedList(
      entrada(progreso({ weak: muchasDebiles, words: { a: 1, b: 1, c: 1, d: 1 } })),
    );
    expect(lista).toHaveLength(10);
    expect(lista.filter((e) => e.id.startsWith('w-')).length).toBeLessThanOrEqual(3);
    const palabras = buildPersonalizedList(
      entrada(progreso({ words: { a: 1, b: 1, c: 1, d: 1 } })),
    );
    expect(palabras.filter((e) => e.id.startsWith('w-'))).toHaveLength(3);
  });

  it('es repetible con el mismo azar y distinta con otro', () => {
    expect(ids(buildPersonalizedList(entrada(progreso(), 5)))).toEqual(
      ids(buildPersonalizedList(entrada(progreso(), 5))),
    );
    expect(ids(buildPersonalizedList(entrada(progreso(), 5)))).not.toEqual(
      ids(buildPersonalizedList(entrada(progreso(), 6))),
    );
  });
});

describe('desafío cronometrado', () => {
  it('usa solo ejercicios rápidos de las unidades abiertas', () => {
    const lista = buildTimedList(entrada(progreso()));
    expect(lista.length).toBe(16); // en Saludos: 5 elegir + 4 ordenar + 4 escribir + 3 escuchar
    expect(lista.every((e) => ['mc', 'write', 'order', 'listen'].includes(e.type))).toBe(true);
    expect(lista.every((e) => e.id.startsWith('u-saludos-'))).toBe(true);
  });

  it('con más unidades abiertas se limita a 40', () => {
    const lista = buildTimedList(entrada(progreso({ lessonsDone: hechas(4) })));
    expect(lista).toHaveLength(TIMED_SIZE);
    expect(new Set(ids(lista)).size).toBe(TIMED_SIZE);
  });
});

describe('prueba de nivel', () => {
  it('arma 12 ejercicios de la unidad elegida y sin hablar', () => {
    const lista = buildPlacementList(entrada(progreso()), 'u-viajes');
    expect(lista).toHaveLength(PLACEMENT_SIZE);
    expect(lista.every((e) => e.id.startsWith('u-viajes-') && e.type !== 'speak')).toBe(true);
    expect(buildPlacementList(entrada(progreso()), 'u-no-existe')).toEqual([]);
  });
});

describe('practiceConfig', () => {
  const pro = (o: Partial<ProgressState> = {}) =>
    progreso({ ...o, settings: { ...initialProgress().settings, plan: 'pro' } });
  const gratis = (o: Partial<ProgressState> = {}) =>
    progreso({ ...o, settings: { ...initialProgress().settings, plan: 'free' } });

  it('todos los modos de práctica son del plan PRO', () => {
    for (const kind of [
      { kind: 'review' },
      { kind: 'personalized' },
      { kind: 'timed' },
      { kind: 'placement', unitId: 'u-comida' },
    ] as const) {
      expect(practiceConfig(kind, entrada(gratis({ errors: ['u-saludos-e01'] })), TODAY)).toEqual({
        ok: false,
        reason: 'pro-required',
      });
    }
  });

  it('el repaso sin errores avisa que no hay nada que repasar', () => {
    expect(practiceConfig({ kind: 'review' }, entrada(pro()), TODAY)).toEqual({
      ok: false,
      reason: 'nothing-to-review',
    });
  });

  it('cada modo usa el modo de sesión de la versión heredada', () => {
    const p = pro({ errors: ['u-saludos-e01'] });
    const modo = (kind: Parameters<typeof practiceConfig>[0]) => {
      const r = practiceConfig(kind, entrada(p), TODAY);
      return r.ok ? r.config.mode : r.reason;
    };
    expect(modo({ kind: 'review' })).toBe('review');
    expect(modo({ kind: 'personalized' })).toBe('practice');
    expect(modo({ kind: 'timed' })).toBe('timed');
    expect(modo({ kind: 'placement', unitId: 'u-comida' })).toBe('test');
  });

  it('el desafío dura 90 segundos y la prueba de nivel lleva su unidad', () => {
    const t = practiceConfig({ kind: 'timed' }, entrada(pro()), TODAY);
    expect(t.ok && t.config.timeLimitSec).toBe(TIMED_SECONDS);
    const placement = practiceConfig(
      { kind: 'placement', unitId: 'u-comida' },
      entrada(pro()),
      TODAY,
    );
    expect(placement.ok && placement.config.unitId).toBe('u-comida');
  });

  it('no permite probar una unidad inexistente ni una ya completa', () => {
    expect(practiceConfig({ kind: 'placement', unitId: 'u-x' }, entrada(pro()), TODAY)).toEqual({
      ok: false,
      reason: 'unit-not-found',
    });
    expect(
      practiceConfig(
        { kind: 'placement', unitId: 'u-saludos' },
        entrada(pro({ lessonsDone: hechas(1) })),
        TODAY,
      ),
    ).toEqual({ ok: false, reason: 'unit-completed' });
  });
});

// ---- Con el motor de lección y el pliegue ----

function bien(e: Exercise): Answer {
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
function mal(e: Exercise): Answer {
  return e.type === 'mc'
    ? { type: 'mc', optionIndex: (e.answerIndex + 1) % e.options.length }
    : e.type === 'match'
      ? { type: 'match', mistakes: 3 }
      : { type: 'write', text: 'zzz zzz zzz' };
}

function jugar(
  config: Parameters<typeof startLesson>[0],
  acierta: (i: number) => boolean,
  segundosPorEjercicio = 5,
) {
  const inicio = startLesson(config, T0);
  if (!inicio.ok) throw new Error(inicio.reason);
  let { state } = inicio;
  const effects: LessonEffect[] = [];
  let t = T0;
  while (state.phase !== 'finished' && state.phase !== 'aborted') {
    t += segundosPorEjercicio * 1000;
    const tic = stepLesson(state, { type: 'tick', nowMs: t });
    effects.push(...tic.effects);
    state = tic.state;
    if (state.phase === 'finished') break;
    const ex = currentExercise(state)!;
    const r = stepLesson(state, {
      type: 'submit',
      answer: acierta(state.index) ? bien(ex) : mal(ex),
      nowMs: t,
    });
    effects.push(...r.effects);
    const c = stepLesson(r.state, { type: 'continue', nowMs: t });
    effects.push(...c.effects);
    state = c.state;
  }
  return { state, effects };
}
const pendientes = (effects: LessonEffect[]) =>
  effects.flatMap((e) => (e.kind === 'record' ? [e.event] : []));
const completar = (effects: LessonEffect[], ini = 1) =>
  pendientes(effects).map((p, i) =>
    completeEvent(p, {
      id: `00000000-0000-4000-8000-${String(ini * 1000 + i).padStart(12, '0')}`,
      nowMs: T0 + i * 1000,
      contentVersion: 1,
    }),
  );

describe('desafío cronometrado en el motor', () => {
  const config = () => {
    const r = practiceConfig(
      { kind: 'timed' },
      entrada(progreso({ lessonsDone: hechas(4) })),
      TODAY,
    );
    if (!r.ok) throw new Error(r.reason);
    return r.config;
  };

  it('cuenta atrás y se agota a los 90 segundos aunque queden ejercicios', () => {
    const ini = startLesson(config(), T0);
    if (!ini.ok) throw new Error();
    expect(remainingSec(ini.state, T0)).toBe(90);
    expect(remainingSec(ini.state, T0 + 30_000)).toBe(60);
    expect(remainingSec(ini.state, T0 + 200_000)).toBe(0);
    expect(stepLesson(ini.state, { type: 'tick', nowMs: T0 + 89_000 }).state).toBe(ini.state);
    const fin = stepLesson(ini.state, { type: 'tick', nowMs: T0 + 90_000 });
    expect(fin.state.phase).toBe('finished');
    expect(pendientes(fin.effects)).toEqual([
      expect.objectContaining({ type: 'session_completed@1' }),
    ]);
  });

  it('con 5 segundos por ejercicio contesta 17 antes de que se agoten los 90 segundos: 5 de XP por acierto', () => {
    const { state } = jugar(config(), () => true, 5);
    expect(state.phase).toBe('finished');
    expect(state.answered).toBe(17);
    expect(state.summary!.score).toMatchObject({ xp: 85, gems: 5, perfect: false });
  });

  it('una sesión sin límite no reacciona al tiempo', () => {
    const ini = startLesson(
      { mode: 'lesson', exercises: units[0]!.exercises.slice(0, 3), plan: 'pro', hearts: 5 },
      T0,
    );
    if (!ini.ok) throw new Error();
    expect(remainingSec(ini.state, T0 + 1e9)).toBeNull();
    expect(stepLesson(ini.state, { type: 'tick', nowMs: T0 + 1e9 }).state).toBe(ini.state);
  });
});

describe('repaso y prueba de nivel con el pliegue de eventos', () => {
  it('acertar en el repaso limpia los errores y las palabras a mejorar', () => {
    const fallado = foldEvents(
      [
        {
          id: '00000000-0000-4000-8000-0000000000a1',
          type: 'exercise_answered@1',
          occurredAt: '2026-10-27T09:00:00.000Z',
          contentVersion: 1,
          payload: { exerciseId: 'u-saludos-e03', correct: false, mode: 'lesson' },
        },
        {
          id: '00000000-0000-4000-8000-0000000000a2',
          type: 'exercise_answered@1',
          occurredAt: '2026-10-27T09:01:00.000Z',
          contentVersion: 1,
          payload: { exerciseId: 'w-cheese', correct: false, mode: 'lesson' },
        },
      ],
      TEST_CONTEXT,
    );
    expect(fallado.errors).toEqual(['u-saludos-e03']);
    expect(fallado.words).toEqual({ cheese: 1 });

    const r = practiceConfig(
      { kind: 'review' },
      { units, progress: fallado, random: azar() },
      TODAY,
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.config.exercises.length).toBe(3); // 1 error + 2 de la palabra
    const { effects } = jugar(r.config, () => true);
    const limpio = foldEvents(completar(effects, 2), TEST_CONTEXT, { initial: fallado });
    expect(limpio.errors).toEqual([]);
    expect(limpio.words).toEqual({});
    expect(limpio.stats.lessons).toBe(1);
  });

  it('aprobar la prueba de nivel completa las unidades hasta la elegida', () => {
    const r = practiceConfig({ kind: 'placement', unitId: 'u-familia' }, entrada(pro()), TODAY);
    if (!r.ok) throw new Error(r.reason);
    const { state, effects } = jugar(r.config, (i) => i !== 3 && i !== 7); // 10 de 12
    expect(state.summary!.score).toMatchObject({ passed: true, xp: 40, gems: 25, accuracy: 83 });
    const estado = foldEvents(completar(effects, 3), TEST_CONTEXT);
    expect(
      ['u-saludos', 'u-comida', 'u-familia', 'u-viajes', 'u-trabajo'].map(
        (id) => estado.lessonsDone[id] ?? 0,
      ),
    ).toEqual([3, 3, 3, 0, 0]);
  });

  it('reprobar la prueba de nivel no avanza nada', () => {
    const r = practiceConfig({ kind: 'placement', unitId: 'u-familia' }, entrada(pro()), TODAY);
    if (!r.ok) throw new Error(r.reason);
    const { state, effects } = jugar(r.config, (i) => i < 9); // 9 de 12 = 75 por ciento
    expect(state.summary!.score).toMatchObject({ passed: false, xp: 0 });
    const estado = foldEvents(completar(effects, 4), TEST_CONTEXT);
    expect(estado.lessonsDone).toEqual({});
  });
});

function pro(o: Partial<ProgressState> = {}): ProgressState {
  return progreso({ ...o, settings: { ...initialProgress().settings, plan: 'pro' } });
}
