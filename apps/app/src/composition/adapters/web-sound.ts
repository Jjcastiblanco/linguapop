import type { Sound, SoundEffect } from '@linguapop/domain';

export type ToneSpec = {
  /** Frecuencia en hercios. */
  freq: number;
  /** Segundos desde que se pide el efecto hasta que empieza este tono. */
  start: number;
  /** Duración en segundos. */
  duration: number;
  type: 'sine' | 'square' | 'sawtooth' | 'triangle';
  volume: number;
};

const tone = (
  freq: number,
  start: number,
  duration: number,
  type: ToneSpec['type'] = 'sine',
  volume = 0.18,
): ToneSpec => ({
  freq,
  start,
  duration,
  type,
  volume,
});

/** Los sonidos de la app, generados con Web Audio (sin archivos): los mismos de la versión heredada. */
export const SOUND_DEFS: Record<SoundEffect, readonly ToneSpec[]> = {
  ok: [tone(660, 0, 0.14, 'triangle'), tone(880, 0.1, 0.22, 'triangle')],
  bad: [tone(210, 0, 0.22, 'sawtooth', 0.12), tone(150, 0.16, 0.3, 'sawtooth', 0.12)],
  click: [tone(520, 0, 0.06, 'square', 0.05)],
  win: [523, 659, 784, 1047].map((f, i) => tone(f, i * 0.12, 0.32, 'triangle')),
  ring: [0, 1].flatMap((i) => [
    tone(440, i * 1.1, 0.4, 'sine', 0.12),
    tone(480, i * 1.1, 0.4, 'sine', 0.12),
  ]),
  hangup: [tone(420, 0, 0.15, 'square', 0.07), tone(300, 0.16, 0.26, 'square', 0.07)],
};

/** Lo mínimo de Web Audio que se usa; permite probar con un contexto falso. */
export type AudioContextLike = {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void> | void;
  createOscillator(): {
    type: string;
    frequency: { value: number };
    connect(node: unknown): void;
    start(when: number): void;
    stop(when: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(value: number, when: number): void;
      linearRampToValueAtTime(value: number, when: number): void;
      exponentialRampToValueAtTime(value: number, when: number): void;
    };
    connect(node: unknown): void;
  };
};

export type WebSound = Sound & {
  /** Cambia de dónde se lee si el sonido está activado (lo conecta la composición con las preferencias). */
  setEnabledSource(source: () => boolean): void;
};

export type WebSoundOptions = {
  /** Crea el contexto de audio; por defecto el del navegador. Devuelve nulo si no hay. */
  createContext?: () => AudioContextLike | null;
  isEnabled?: () => boolean;
};

function browserContext(): AudioContextLike | null {
  const w = globalThis as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * Sonidos con Web Audio. El contexto se crea la primera vez que suena algo (el navegador exige
 * un gesto del usuario) y cualquier fallo se ignora: un sonido que no suena nunca rompe la app.
 */
export function createWebSound(options: WebSoundOptions = {}): WebSound {
  let enabled = options.isEnabled ?? (() => true);
  let context: AudioContextLike | null | undefined;

  const ensureContext = (): AudioContextLike | null => {
    if (context === undefined) {
      try {
        context = (options.createContext ?? browserContext)();
      } catch {
        context = null;
      }
    }
    if (context && context.state === 'suspended') {
      try {
        void Promise.resolve(context.resume()).catch(() => undefined);
      } catch {
        /* sin permiso para reanudar: se intenta en el próximo sonido */
      }
    }
    return context;
  };

  return {
    setEnabledSource(source) {
      enabled = source;
    },
    play(effect) {
      if (!enabled()) return;
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        for (const spec of SOUND_DEFS[effect]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = ctx.currentTime + spec.start;
          osc.type = spec.type;
          osc.frequency.value = spec.freq;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(spec.volume, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + spec.duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + spec.duration + 0.05);
        }
      } catch {
        /* un sonido fallido no debe afectar a la lección */
      }
    },
  };
}
