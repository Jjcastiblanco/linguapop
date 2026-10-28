import {
  startCall,
  stepCall,
  type CallEffect,
  type CallInput,
  type CallState,
  type Expression,
} from '@linguapop/domain';
import type { DialogueTopic } from '@linguapop/content';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Composition } from '../composition';
import type { ProgressStore } from './progress-store';

/** Cuánto suena el timbre antes de que Nova conteste. */
export const RING_MS = 2600;
/** Tono de la voz de Nova. */
const NOVA_PITCH = 1.18;

export type CallLogEntry = { who: 'nova' | 'me'; text: string };

export type CallStoreState = {
  /** La llamada en curso o recién terminada, o nulo si no hay ninguna. */
  call: CallState | null;
  expression: Expression;
  /** Nova está hablando. */
  talking: boolean;
  /** El micrófono está escuchando. */
  listening: boolean;
  /** El estudiante quiere usar el micrófono (se puede apagar). */
  micOn: boolean;
  /** Hay reconocimiento de voz utilizable; si falla a media llamada pasa a falso y se escribe. */
  voiceIn: boolean;
  /** Modo chat: no hay voz completa (hablar y escuchar) en este dispositivo. */
  chat: boolean;
  /** Lo último que dijo Nova y lo último que dijo el estudiante, para los subtítulos. */
  subtitle: { nova: string; me: string };
  hint: string | null;
  log: CallLogEntry[];
  /** El micrófono falló a media llamada y se sigue escribiendo. */
  micFailed: boolean;
  start: (topic: DialogueTopic) => void;
  /** Respuesta escrita; si Nova aún habla se guarda para cuando termine. */
  submitText: (text: string) => void;
  toggleMic: () => void;
  hangup: () => void;
  /** Vuelve al estado inicial, cortando lo que esté en curso. */
  reset: () => void;
};

export type CallStore = StoreApi<CallStoreState>;

const IDLE = {
  call: null,
  expression: 'neutral',
  talking: false,
  listening: false,
  micOn: true,
  voiceIn: false,
  chat: false,
  subtitle: { nova: '', me: '' },
  hint: null,
  log: [],
  micFailed: false,
} satisfies Partial<CallStoreState>;

/**
 * Llamada con Nova: envuelve el motor puro del dominio y ejecuta en orden los efectos que pide
 * (voz, escucha, pista, sonido y registro), esperando a que cada voz termine. Al colgar sube una
 * ficha para que los efectos pendientes de esa llamada no actúen.
 */
export function createCallStore(c: Composition, progress: ProgressStore): CallStore {
  let token = 0;
  /** Cada cambio del micrófono invalida la escucha en curso: su resultado se descarta. */
  let listenGen = 0;
  let queued = '';
  let ringTimer: ReturnType<typeof setTimeout> | undefined;

  const store: CallStore = createStore<CallStoreState>((set, get) => {
    /**
     * Aplica el paso del motor. El registro de la llamada se guarda al instante y no al final de la
     * cola: si el estudiante sale mientras Nova se despide, la llamada completada no se pierde.
     */
    const launch = (effects: readonly CallEffect[], tok: number) => {
      for (const e of effects) if (e.kind === 'record') void progress.getState().record([e.event]);
      void run(
        effects.filter((e) => e.kind !== 'record'),
        tok,
      );
    };

    const dispatch = (input: CallInput, tok = token) => {
      const { call } = get();
      if (!call || tok !== token) return;
      const step = stepCall(call, input);
      set({ call: step.state });
      launch(step.effects, tok);
    };

    const say = async (e: Extract<CallEffect, { kind: 'say' }>, tok: number) => {
      set((s) => ({
        expression: e.expression,
        talking: true,
        subtitle: { ...s.subtitle, nova: e.text },
        log: [...s.log, { who: 'nova', text: e.text }],
      }));
      if (c.speech.capabilities().canSpeak) {
        await c.speech.speak(e.text, {
          pitch: NOVA_PITCH,
          ...(e.rate !== undefined ? { rate: e.rate } : {}),
        });
      }
      if (tok === token) set({ talking: false });
    };

    const listen = async (tok: number) => {
      const gen = ++listenGen;
      if (queued) {
        const text = queued;
        queued = '';
        return dispatch({ type: 'heard', alternatives: [text], nowMs: c.clock.now() }, tok);
      }
      const { voiceIn, micOn } = get();
      if (!voiceIn || !micOn) return; // se espera lo que escriba el estudiante
      set({ listening: true });
      const result = await c.speech.listen({
        onInterim: (text) => {
          if (gen === listenGen) set((s) => ({ subtitle: { ...s.subtitle, me: text } }));
        },
      });
      if (tok !== token || gen !== listenGen) return;
      set({ listening: false });
      if (result.kind === 'heard') {
        const text = result.alternatives[0] ?? '';
        set((s) => ({
          subtitle: { ...s.subtitle, me: text },
          log: [...s.log, { who: 'me', text }],
        }));
        dispatch({ type: 'heard', alternatives: result.alternatives, nowMs: c.clock.now() }, tok);
      } else if (result.kind === 'silence') {
        dispatch({ type: 'silence', nowMs: c.clock.now() }, tok);
      } else {
        // Sin micrófono la llamada sigue: ahora se contesta escribiendo.
        set({ voiceIn: false, micFailed: true });
      }
    };

    const run = async (effects: readonly CallEffect[], tok: number) => {
      for (const e of effects) {
        if (tok !== token) return;
        switch (e.kind) {
          case 'sound':
            c.sound.play(e.sound);
            break;
          case 'say':
            await say(e, tok);
            break;
          case 'show-hint':
            set({ hint: e.text });
            break;
          case 'hide-hint':
            set({ hint: null });
            break;
          case 'listen':
            await listen(tok);
            return;
          case 'record':
            break; // ya se guardó en `launch`
          case 'ask-agent':
            // La conversación libre con IA no está conectada en esta versión.
            dispatch({ type: 'agent-error', nowMs: c.clock.now() }, tok);
            break;
          case 'notice':
            break;
        }
      }
    };

    const stop = () => {
      token++;
      listenGen++;
      clearTimeout(ringTimer);
      queued = '';
      c.speech.cancel();
    };

    return {
      ...IDLE,
      start(topic) {
        stop();
        const caps = c.speech.capabilities();
        const step = startCall(topic);
        set({
          ...IDLE,
          call: step.state,
          voiceIn: caps.canListen,
          chat: !(caps.canSpeak && caps.canListen),
          micOn: true,
        });
        const tok = token;
        launch(step.effects, tok);
        ringTimer = setTimeout(
          () => dispatch({ type: 'connected', nowMs: c.clock.now() }, tok),
          RING_MS,
        );
      },
      submitText(raw) {
        const text = raw.trim();
        const { call, talking } = get();
        if (!text || !call || call.phase === 'ended' || call.phase === 'cancelled') return;
        set((s) => ({
          subtitle: { ...s.subtitle, me: text },
          log: [...s.log, { who: 'me', text }],
        }));
        if (call.phase !== 'active' || call.awaiting !== 'answer' || talking) {
          queued = text;
          return;
        }
        // Se deja de escuchar: lo escrito reemplaza a la voz.
        listenGen++;
        c.speech.cancel();
        set({ listening: false });
        dispatch({ type: 'heard', alternatives: [text], nowMs: c.clock.now() });
      },
      toggleMic() {
        const { micOn, voiceIn, call, talking } = get();
        if (!voiceIn || !call) return;
        set({ micOn: !micOn });
        if (micOn) {
          // Se apaga: se corta la escucha y su resultado se descarta (no cuenta como silencio).
          listenGen++;
          if (get().listening) c.speech.cancel();
          set({ listening: false });
        } else if (call.phase === 'active' && call.awaiting === 'answer' && !talking) {
          void listen(token);
        }
      },
      hangup() {
        const { call } = get();
        if (!call || call.phase === 'ended' || call.phase === 'cancelled') return;
        stop();
        const tok = token;
        const step = stepCall(call, { type: 'hangup', nowMs: c.clock.now() });
        set({ call: step.state, talking: false, listening: false, hint: null });
        launch(step.effects, tok);
      },
      reset() {
        stop();
        set({ ...IDLE });
      },
    };
  });
  return store;
}
