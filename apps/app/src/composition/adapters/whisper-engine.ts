import type { FromWorker, ToWorker } from './whisper-worker';
import type { ModelEngine } from './model-pack';

/** Lo que el motor usa del navegador; las pruebas lo reemplazan por uno falso. */
export type WorkerLike = {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
};

/** Tamaño aproximado de la descarga: Whisper tiny.en cuantizado (codificador y decodificador). */
export const WHISPER_SIZE_MB = 40;

export type WhisperEngine = ModelEngine & {
  /** Transcribe audio mono a 16 kHz; lanza con el motivo si no pudo. */
  transcribe(samples: Float32Array): Promise<string>;
};

export const browserWorker = (): WorkerLike =>
  new Worker(new URL('./whisper-worker.ts', import.meta.url), { type: 'module' });

/**
 * Reconocimiento de voz en el dispositivo (AD-11): Whisper tiny.en en un worker. El modelo lo baja
 * y guarda la propia biblioteca en la caché del navegador. Atiende una transcripción a la vez.
 */
export function createWhisperEngine(createWorker: () => WorkerLike = browserWorker): WhisperEngine {
  let worker: WorkerLike | null = null;
  let onProgress: ((f: number) => void) | null = null;
  let loading: { resolve: () => void; reject: (e: Error) => void } | null = null;
  let nextId = 0;
  const running = new Map<number, (result: string | Error) => void>();

  const fail = (e: Error) => {
    loading?.reject(e);
    loading = null;
    for (const done of running.values()) done(e);
    running.clear();
    worker?.terminate();
    worker = null;
  };

  return {
    load(progress) {
      onProgress = progress;
      return new Promise<void>((resolve, reject) => {
        try {
          worker = createWorker();
        } catch (e) {
          return reject(e as Error);
        }
        loading = { resolve, reject };
        worker.onerror = () => fail(new Error('no se pudo iniciar el worker'));
        worker.onmessage = (event) => {
          const m = event.data;
          if (m.type === 'progress') onProgress?.(m.fraction);
          else if (m.type === 'ready') {
            loading?.resolve();
            loading = null;
          } else if (m.type === 'text') running.get(m.id)?.(m.text);
          else if (m.type === 'error') {
            if (m.id === undefined) fail(new Error(m.message));
            else running.get(m.id)?.(new Error(m.message));
          }
        };
        worker.postMessage({ type: 'load' });
      });
    },
    async transcribe(samples) {
      if (!worker) throw new Error('modelo sin cargar');
      const id = ++nextId;
      const result = await new Promise<string | Error>((resolve) => {
        running.set(id, resolve);
        worker!.postMessage({ type: 'run', id, samples }, [samples.buffer]);
      });
      running.delete(id);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}
