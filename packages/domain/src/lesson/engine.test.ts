import { seedUnits, type Exercise } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { completeEvent, type ProgressEvent } from '../events';
import type { Answer } from '../exercises';
import { foldEvents, initialProgress } from '../progress';
import { TEST_CONTEXT } from '../progress/test-support';
import { shuffle } from '../random';
import {
  currentExercise,
  exercisesOfLesson,
  lessonProgress,
  startLesson,
  stepLesson,
  type LessonConfig,
  type LessonEffect,
  type LessonState,
} from './index';

const saludos = seedUnits[0]!;
const leccion1 = saludos.lessons[0]!;
const ejercicios = exercisesOfLesson(saludos, leccion1);
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);

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

const config = (o: Partial<LessonConfig> = {}): LessonConfig => ({
  mode: 'lesson',
  exercises: ejercicios,
  unitId: saludos.id,
  lessonId: leccion1.id,
  plan: 'pro',
  hearts: 5,
  ...o,
});

type Ejecucion = { state: LessonState; effects: LessonEffect[] };

/** Juega la sesión entera: `acierta(i)` dice si el ejercicio i se responde bien. Pasa 5 segundos por ejercicio. */
function jugar(cfg: LessonConfig, acierta: (i: number) => boolean): Ejecucion {
  const inicio = startLesson(cfg, T0);
  if (!inicio.ok) throw new Error(inicio.reason);
  let { state } = inicio;
  const effects: LessonEffect[] = [...inicio.effects];
  let t = T0;
  while (state.phase !== 'finished') {
    const ex = currentExercise(state)!;
    t += 5000;
    const respuesta = stepLesson(state, {
      type: 'submit',
      answer: acierta(state.index) ? bien(ex) : mal(ex),
      nowMs: t,
    });
    effects.push(...respuesta.effects);
    const siguiente = stepLesson(respuesta.state, { type: 'continue', nowMs: t });
    effects.push(...siguiente.effects);
    state = siguiente.state;
  }
  return { state, effects };
}

const eventosDe = (effects: LessonEffect[]) =>
  effects.flatMap((e) => (e.kind === 'record' ? [e.event] : []));

describe('exercisesOfLesson', () => {
  it('devuelve los 10 ejercicios de la lección, en su orden', () => {
    expect(ejercicios.map((e) => e.id)).toEqual(leccion1.exerciseIds);
    expect(ejercicios).toHaveLength(10);
  });

  it('omite los ejercicios retirados', () => {
    const unidad = {
      ...saludos,
      exercises: saludos.exercises.map((e) =>
        e.id === leccion1.exerciseIds[0] ? { ...e, retired: true } : e,
      ),
    };
    expect(exercisesOfLesson(unidad, leccion1)).toHaveLength(9);
  });
});

describe('lección perfecta (plan PRO)', () => {
  const { state, effects } = jugar(config(), () => true);

  it('termina con todo acertado y el premio de una lección perfecta', () => {
    expect(state).toMatchObject({
      phase: 'finished',
      correct: 10,
      wrong: 0,
      answered: 10,
      skipped: 0,
      outOfHearts: false,
    });
    expect(state.summary!.score).toEqual({
      xp: 120,
      gems: 10,
      accuracy: 100,
      perfect: true,
      passed: null,
    });
    expect(state.summary!.durationSec).toBe(50);
  });

  it('emite un evento por ejercicio y uno de sesión al final', () => {
    const eventos = eventosDe(effects);
    expect(eventos).toHaveLength(11);
    expect(eventos.slice(0, 10).every((e) => e.type === 'exercise_answered@1')).toBe(true);
    expect(eventos[10]).toEqual({
      type: 'session_completed@1',
      payload: {
        mode: 'lesson',
        unitId: 'u-saludos',
        lessonId: 'u-saludos-l1',
        correct: 10,
        wrong: 0,
        answered: 10,
        durationSec: 50,
        outOfHearts: false,
      },
    });
  });

  it('pide sonido de acierto, el de victoria al final y hablar al entrar a "escuchar" y tras ordenar o escribir bien', () => {
    expect(effects.filter((e) => e.kind === 'sound' && e.sound === 'ok')).toHaveLength(10);
    expect(effects.filter((e) => e.kind === 'sound' && e.sound === 'win')).toHaveLength(1);
    const hablados = effects.filter((e) => e.kind === 'speak').length;
    const escuchas = ejercicios.filter((e) => e.type === 'listen').length;
    const ordenarOEscribir = ejercicios.filter(
      (e) => e.type === 'order' || e.type === 'write',
    ).length;
    expect(hablados).toBe(escuchas + ordenarOEscribir);
  });

  it('el progreso llega a 1', () => {
    expect(lessonProgress(state)).toBe(1);
  });
});

describe('lección con errores', () => {
  it('cuenta aciertos y fallos y marca cada ejercicio', () => {
    const fallos = new Set([2, 5, 8]);
    const { state, effects } = jugar(config(), (i) => !fallos.has(i));
    expect(state).toMatchObject({ correct: 7, wrong: 3, answered: 10 });
    expect(state.summary!.score).toMatchObject({ xp: 70, gems: 5, perfect: false, accuracy: 70 });
    const respondidos = eventosDe(effects).filter((e) => e.type === 'exercise_answered@1');
    expect(
      respondidos.map((e) => (e.type === 'exercise_answered@1' ? e.payload.correct : null)),
    ).toEqual(ejercicios.map((_, i) => !fallos.has(i)));
    expect(effects.filter((e) => e.kind === 'sound' && e.sound === 'bad')).toHaveLength(3);
  });

  it('en PRO las vidas no bajan', () => {
    const { state } = jugar(config(), () => false);
    expect(state.hearts).toBe(5);
    expect(state.outOfHearts).toBe(false);
    expect(state.answered).toBe(10);
  });

  it('una lección repetida da la mitad de XP y sin gemas', () => {
    const { state } = jugar(config({ isReplay: true }), () => true);
    expect(state.summary!.score).toMatchObject({ xp: 60, gems: 0 });
  });
});

describe('plan gratis y vidas', () => {
  it('cada fallo quita una vida y sin vidas la sesión termina antes', () => {
    const { state, effects } = jugar(config({ plan: 'free', hearts: 5 }), (i) => i < 2);
    // acierta 2, falla 5 seguidos (se agotan las vidas) y no llega a los 10
    expect(state).toMatchObject({
      phase: 'finished',
      correct: 2,
      wrong: 5,
      answered: 7,
      hearts: 0,
      outOfHearts: true,
    });
    expect(state.summary).toMatchObject({ outOfHearts: true });
    expect(state.summary!.score).toMatchObject({ xp: 4, gems: 0 }); // 2 aciertos por 2
    const sesion = eventosDe(effects).at(-1)!;
    expect(sesion).toMatchObject({
      type: 'session_completed@1',
      payload: { outOfHearts: true, answered: 7, correct: 2, wrong: 5 },
    });
    expect(effects.filter((e) => e.kind === 'sound' && e.sound === 'win')).toHaveLength(0);
    expect(effects.at(-2)).toEqual({ kind: 'sound', sound: 'bad' });
  });

  it('no empieza sin vidas en el plan gratis, pero sí en PRO', () => {
    expect(startLesson(config({ plan: 'free', hearts: 0 }), T0)).toEqual({
      ok: false,
      reason: 'no-hearts',
    });
    expect(startLesson(config({ plan: 'pro', hearts: 0 }), T0).ok).toBe(true);
  });

  it('en el desafío no se pierden vidas', () => {
    const { state } = jugar(config({ mode: 'timed', plan: 'free', hearts: 1 }), () => false);
    expect(state.hearts).toBe(1);
    expect(state.outOfHearts).toBe(false);
  });

  it('no empieza sin ejercicios', () => {
    expect(startLesson(config({ exercises: [] }), T0)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('ejercicios omitidos y entradas fuera de lugar', () => {
  const idxHablar = ejercicios.findIndex((e) => e.type === 'speak');

  it('omitir un ejercicio de voz no cuenta como acierto ni fallo y se anota como omitido', () => {
    const inicio = startLesson(config(), T0);
    if (!inicio.ok) throw new Error();
    let s = inicio.state;
    while (s.index < idxHablar) {
      s = stepLesson(
        stepLesson(s, { type: 'submit', answer: bien(currentExercise(s)!), nowMs: T0 }).state,
        { type: 'continue', nowMs: T0 },
      ).state;
    }
    const r = stepLesson(s, { type: 'submit', answer: { type: 'speak-skipped' }, nowMs: T0 });
    expect(r.state).toMatchObject({ skipped: 1, answered: idxHablar, wrong: 0 });
    expect(r.effects.filter((e) => e.kind === 'sound')).toEqual([]);
    expect(eventosDe(r.effects)).toEqual([
      {
        type: 'exercise_answered@1',
        payload: {
          exerciseId: ejercicios[idxHablar]!.id,
          correct: true,
          mode: 'lesson',
          skipped: true,
        },
      },
    ]);
  });

  it('ignora entradas que no corresponden a la fase, sin lanzar ni cambiar nada', () => {
    const inicio = startLesson(config(), T0);
    if (!inicio.ok) throw new Error();
    const s0 = inicio.state;
    expect(stepLesson(s0, { type: 'continue', nowMs: T0 })).toEqual({ state: s0, effects: [] });
    const respondido = stepLesson(s0, {
      type: 'submit',
      answer: bien(currentExercise(s0)!),
      nowMs: T0,
    }).state;
    const otra = stepLesson(respondido, {
      type: 'submit',
      answer: bien(currentExercise(respondido)!),
      nowMs: T0,
    });
    expect(otra.state).toBe(respondido);
    expect(otra.effects).toEqual([]);
  });

  it('abandonar no emite eventos y la sesión deja de responder', () => {
    const inicio = startLesson(config(), T0);
    if (!inicio.ok) throw new Error();
    const r = stepLesson(inicio.state, { type: 'abort' });
    expect(r).toEqual({ state: { ...inicio.state, phase: 'aborted' }, effects: [] });
    expect(stepLesson(r.state, { type: 'continue', nowMs: T0 }).state).toBe(r.state);
    expect(currentExercise(r.state)).toBeUndefined();
  });

  it('una respuesta de otro tipo falla sin romper la sesión', () => {
    const inicio = startLesson(config(), T0);
    if (!inicio.ok) throw new Error();
    const r = stepLesson(inicio.state, {
      type: 'submit',
      answer: { type: 'speak-skipped' },
      nowMs: T0,
    });
    expect(r.state.wrong).toBe(1);
  });
});

describe('progreso y pureza', () => {
  it('la barra avanza con cada ejercicio respondido', () => {
    const inicio = startLesson(config(), T0);
    if (!inicio.ok) throw new Error();
    expect(lessonProgress(inicio.state)).toBe(0);
    const r = stepLesson(inicio.state, {
      type: 'submit',
      answer: bien(currentExercise(inicio.state)!),
      nowMs: T0,
    });
    expect(lessonProgress(r.state)).toBeCloseTo(0.1);
    expect(lessonProgress(stepLesson(r.state, { type: 'continue', nowMs: T0 }).state)).toBeCloseTo(
      0.1,
    );
  });

  it('no modifica el estado recibido y es determinista', () => {
    const inicio = startLesson(config(), T0);
    if (!inicio.ok) throw new Error();
    const copia = JSON.parse(JSON.stringify(inicio.state));
    const entrada = {
      type: 'submit',
      answer: bien(currentExercise(inicio.state)!),
      nowMs: T0,
    } as const;
    const a = stepLesson(inicio.state, entrada);
    const b = stepLesson(inicio.state, entrada);
    expect(JSON.parse(JSON.stringify(inicio.state))).toEqual(copia);
    expect(a).toEqual(b);
  });
});

describe('con el pliegue de eventos', () => {
  it('los eventos de una lección completan la lección, dan el XP y siguen al día siguiente', () => {
    const { effects } = jugar(config(), () => true);
    const eventos: ProgressEvent[] = eventosDe(effects).map((pendiente, i) =>
      completeEvent(pendiente, {
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        nowMs: T0 + i * 1000,
        contentVersion: 1,
      }),
    );
    const estado = foldEvents(eventos, TEST_CONTEXT);
    expect(estado.lessonsDone['u-saludos']).toBe(1);
    expect(estado.xp).toBe(120);
    expect(estado.stats).toMatchObject({ lessons: 1, perfect: 1, correct: 10, total: 10 });
    expect(estado.streak.streak).toBe(1);
    expect(initialProgress().xp).toBe(0);
  });

  it('en el plan gratis, fallar en la lección alimenta el repaso y las vidas del estado', () => {
    const { effects } = jugar(config({ plan: 'free' }), (i) => i !== 1);
    const eventos = eventosDe(effects).map((p, i) =>
      completeEvent(p, {
        id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
        nowMs: T0 + i * 1000,
        contentVersion: 1,
      }),
    );
    const ajustes = completeEvent(
      { type: 'settings_changed@1', payload: { plan: 'free' } },
      { id: '00000000-0000-4000-8000-000000000099', nowMs: T0 - 1000, contentVersion: 1 },
    );
    const estado = foldEvents([ajustes, ...eventos], TEST_CONTEXT);
    expect(estado.errors).toEqual([ejercicios[1]!.id]);
    expect(estado.hearts).toBe(4);
  });
});

describe('shuffle', () => {
  const fijo = (valores: number[]) => {
    let i = 0;
    return { next: () => valores[i++ % valores.length]! };
  };

  it('mezcla sin perder ni repetir elementos y sin tocar la lista original', () => {
    const original = [1, 2, 3, 4, 5, 6];
    const mezclada = shuffle(original, fijo([0.9, 0.1, 0.5, 0.3, 0.7]));
    expect([...mezclada].sort()).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('con el mismo azar da el mismo resultado', () => {
    const a = shuffle(['a', 'b', 'c', 'd'], fijo([0.2, 0.8, 0.4]));
    const b = shuffle(['a', 'b', 'c', 'd'], fijo([0.2, 0.8, 0.4]));
    expect(a).toEqual(b);
  });

  it('con lista vacía o de uno devuelve lo mismo', () => {
    expect(shuffle([], fijo([0.5]))).toEqual([]);
    expect(shuffle(['x'], fijo([0.5]))).toEqual(['x']);
  });
});
