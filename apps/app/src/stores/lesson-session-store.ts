import {
  startLesson,
  stepLesson,
  type Answer,
  type LessonConfig,
  type LessonEffect,
  type LessonState,
  type StartResult,
} from '@linguapop/domain';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Composition } from '../composition';
import type { ProgressStore } from './progress-store';

export type LessonSessionState = {
  /** La sesión en curso, o nulo si no hay ninguna. */
  lesson: LessonState | null;
  /** Por qué no se pudo empezar, si no se pudo. */
  failure: Extract<StartResult, { ok: false }>['reason'] | null;
  start: (config: LessonConfig) => void;
  submit: (answer: Answer) => void;
  next: () => void;
  /** El tiempo avanza: con límite de tiempo, termina la sesión al agotarse. */
  tick: () => void;
  /** Abandona la sesión sin registrar nada. */
  abort: () => void;
  /** Cierra la sesión terminada o abandonada y vuelve al estado inicial. */
  clear: () => void;
};

export type LessonSessionStore = StoreApi<LessonSessionState>;

/**
 * Sesión de lección: envuelve el motor puro del dominio y ejecuta los efectos que pide
 * (sonido, voz y registro de eventos de progreso) con lo que ofrece la composición.
 */
export function createLessonSessionStore(
  c: Composition,
  progress: ProgressStore,
): LessonSessionStore {
  const run = (effects: readonly LessonEffect[]) => {
    for (const e of effects) {
      if (e.kind === 'sound') c.sound.play(e.sound);
      else if (e.kind === 'speak')
        void c.speech.speak(e.text, e.rate !== undefined ? { rate: e.rate } : {});
      else void progress.getState().record([e.event]);
    }
  };

  return createStore<LessonSessionState>((set, get) => ({
    lesson: null,
    failure: null,
    start(config) {
      const result = startLesson(config, c.clock.now());
      if (!result.ok) return set({ lesson: null, failure: result.reason });
      set({ lesson: result.state, failure: null });
      run(result.effects);
    },
    submit(answer) {
      const { lesson } = get();
      if (!lesson) return;
      const step = stepLesson(lesson, { type: 'submit', answer, nowMs: c.clock.now() });
      set({ lesson: step.state });
      run(step.effects);
    },
    next() {
      const { lesson } = get();
      if (!lesson) return;
      const step = stepLesson(lesson, { type: 'continue', nowMs: c.clock.now() });
      set({ lesson: step.state });
      run(step.effects);
    },
    tick() {
      const { lesson } = get();
      if (!lesson) return;
      const step = stepLesson(lesson, { type: 'tick', nowMs: c.clock.now() });
      if (step.state === lesson) return;
      set({ lesson: step.state });
      run(step.effects);
    },
    abort() {
      const { lesson } = get();
      if (!lesson) return;
      c.speech.cancel();
      set({ lesson: stepLesson(lesson, { type: 'abort' }).state });
    },
    clear: () => set({ lesson: null, failure: null }),
  }));
}
