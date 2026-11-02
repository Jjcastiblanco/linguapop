import type { SpeakOptions } from '@linguapop/domain';
import type { FromWorker, ToWorker } from './kokoro-worker';
import type { TtsEngine } from './voice-pack';

/** Lo que el motor usa del navegador; las pruebas lo reemplazan por uno falso. */
export type EngineEnv = {
  createWorker(): Pick<Worker, 'postMessage' | 'terminate'> & {
    onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
    onerror: ((e: ErrorEvent) => void) | null;
  };
  createPlayer(): AudioPlayer;
};
export type AudioPlayer = {
  /** Reproduce las muestras y termina al acabar; `stop` las corta. */
  play(samples: Float32Array, rate: number): Promise<void>;
  stop(): void;
};

/** Tamaño aproximado de la descarga: modelo `q8` de Kokoro 82M más sus voces. */
export const KOKORO_SIZE_MB = 92;

export function browserEngineEnv(): EngineEnv {
  return {
    createWorker: () =>
      new Worker(new URL('./kokoro-worker.ts', import.meta.url), { type: 'module' }),
    createPlayer: createAudioPlayer,
  };
}

function createAudioPlayer(): AudioPlayer {
  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let finish: (() => void) | null = null;
  const stop = () => {
    try {
      source?.stop();
    } catch {
      /* ya había terminado */
    }
    source = null;
    finish?.();
    finish = null;
  };
  return {
    stop,
    async play(samples, rate) {
      stop();
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const buffer = ctx.createBuffer(1, samples.length, rate);
      buffer.copyToChannel(new Float32Array(samples), 0);
      await new Promise<void>((resolve) => {
        const node = ctx!.createBufferSource();
        node.buffer = buffer;
        node.connect(ctx!.destination);
        node.onended = () => {
          if (source === node) source = null;
          if (finish === resolve) finish = null;
          resolve();
        };
        source = node;
        finish = resolve;
        node.start();
      });
    },
  };
}

/**
 * Voz de respaldo (AD-11): Kokoro 82M en un worker, con las muestras reproducidas por Web Audio.
 * El modelo lo baja y guarda la propia biblioteca en la caché del navegador. Se crea el worker al
 * cargar y se ocupa una sola frase a la vez: pedir otra corta la anterior.
 */
export function createKokoroEngine(env: EngineEnv = browserEngineEnv()): TtsEngine {
  let worker: ReturnType<EngineEnv['createWorker']> | null = null;
  let player: AudioPlayer | null = null;
  let nextId = 0;
  let onProgress: ((f: number) => void) | null = null;
  let loading: { resolve: () => void; reject: (e: Error) => void } | null = null;
  const speaking = new Map<number, (samples: Float32Array | null, rate: number) => void>();

  const send = (m: ToWorker) => worker?.postMessage(m);
  const fail = (e: Error) => {
    loading?.reject(e);
    loading = null;
    for (const done of speaking.values()) done(null, 0);
    speaking.clear();
    worker?.terminate();
    worker = null;
  };

  return {
    load(progress) {
      onProgress = progress;
      return new Promise<void>((resolve, reject) => {
        try {
          worker = env.createWorker();
        } catch (e) {
          return reject(e as Error);
        }
        loading = { resolve, reject };
        worker.onerror = () => fail(new Error('worker'));
        worker.onmessage = (event) => {
          const m = event.data;
          if (m.type === 'progress') onProgress?.(m.fraction);
          else if (m.type === 'ready') {
            loading?.resolve();
            loading = null;
          } else if (m.type === 'audio') speaking.get(m.id)?.(m.samples, m.rate);
          else if (m.type === 'error') {
            if (m.id === undefined) fail(new Error(m.message));
            else speaking.get(m.id)?.(null, 0);
          }
        };
        send({ type: 'load' });
      });
    },
    async speak(text, options: SpeakOptions = {}) {
      if (!worker) return false;
      player ??= env.createPlayer();
      player.stop();
      const id = ++nextId;
      const heard = await new Promise<{ samples: Float32Array; rate: number } | null>((resolve) => {
        speaking.set(id, (samples, rate) => resolve(samples ? { samples, rate } : null));
        send({ type: 'speak', id, text, speed: options.rate ?? 1 });
      });
      speaking.delete(id);
      // Otra frase pidió su turno mientras esta se generaba: esta ya no suena.
      if (!heard || id !== nextId) return false;
      await player.play(heard.samples, heard.rate);
      return true;
    },
    cancel() {
      nextId++; // lo que aún se genera se descarta al llegar
      player?.stop();
    },
  };
}
