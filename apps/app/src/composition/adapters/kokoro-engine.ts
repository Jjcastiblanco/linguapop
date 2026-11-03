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

/** Espera máxima (milisegundos) a que el worker genere una frase, y a que el audio del navegador despierte. */
export const SPEAK_TIMEOUT_MS = 30_000;
export const RESUME_TIMEOUT_MS = 3_000;

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
      if (ctx.state === 'suspended') {
        // Si el navegador no deja despertar el audio, `resume` no responde nunca: se avisa en vez de quedar mudo.
        await Promise.race([
          ctx.resume(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('el navegador bloqueó el audio')), RESUME_TIMEOUT_MS),
          ),
        ]);
      }
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
 * cargar y se ocupa una sola frase a la vez: pedir otra corta la anterior. Los fallos de síntesis o
 * de audio se lanzan para que quien lo usa pueda mostrarlos.
 */
export function createKokoroEngine(env: EngineEnv = browserEngineEnv()): TtsEngine {
  let worker: ReturnType<EngineEnv['createWorker']> | null = null;
  let player: AudioPlayer | null = null;
  let nextId = 0;
  let onProgress: ((f: number) => void) | null = null;
  let loading: { resolve: () => void; reject: (e: Error) => void } | null = null;
  type Heard = { samples: Float32Array; rate: number };
  const speaking = new Map<number, (result: Heard | Error) => void>();

  const send = (m: ToWorker) => worker?.postMessage(m);
  const fail = (e: Error) => {
    loading?.reject(e);
    loading = null;
    for (const done of speaking.values()) done(e);
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
          } else if (m.type === 'audio') speaking.get(m.id)?.({ samples: m.samples, rate: m.rate });
          else if (m.type === 'error') {
            if (m.id === undefined) fail(new Error(m.message));
            else speaking.get(m.id)?.(new Error(m.message));
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
      let timer: ReturnType<typeof setTimeout> | undefined;
      const heard = await new Promise<Heard | Error>((resolve) => {
        speaking.set(id, resolve);
        timer = setTimeout(
          () => resolve(new Error('tiempo agotado generando la voz')),
          SPEAK_TIMEOUT_MS,
        );
        send({ type: 'speak', id, text, speed: options.rate ?? 1 });
      });
      clearTimeout(timer);
      speaking.delete(id);
      // Otra frase pidió su turno mientras esta se generaba: esta ya no suena.
      if (id !== nextId) return false;
      if (heard instanceof Error) throw heard;
      await player.play(heard.samples, heard.rate);
      return true;
    },
    cancel() {
      nextId++; // lo que aún se genera se descarta al llegar
      player?.stop();
    },
  };
}
