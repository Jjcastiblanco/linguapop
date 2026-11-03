/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';

/** Mensajes entre la página y el worker de reconocimiento. */
export type ToWorker = { type: 'load' } | { type: 'run'; id: number; samples: Float32Array };
export type FromWorker =
  | { type: 'progress'; fraction: number }
  | { type: 'ready' }
  | { type: 'text'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };

const MODEL = 'Xenova/whisper-tiny.en';
/** Espera máxima (milisegundos) a la frase de calentamiento de la descarga y a cada transcripción. */
const WARMUP_LIMIT_MS = 90_000;
const RUN_LIMIT_MS = 60_000;

const post = (m: FromWorker) => postMessage(m);

/** Dirección alternativa de los archivos del modelo; solo la usan las pruebas de rendimiento. */
const remoteHost = (globalThis as { __MODEL_HOST__?: string }).__MODEL_HOST__;
if (remoteHost) env.remoteHost = remoteHost;

/** Peticiones de red en curso, para poder decir cuál se quedó esperando si el modelo no responde. */
const pendingFetches = new Map<number, string>();
let fetchId = 0;
const realFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
  const id = ++fetchId;
  const url = String(input instanceof Request ? input.url : input);
  pendingFetches.set(id, url.replace(/^https?:\/\//, '').slice(-80));
  return realFetch(input, init).finally(() => pendingFetches.delete(id));
};
const waiting = () =>
  pendingFetches.size > 0 ? ` (esperando red: ${[...pendingFetches.values()].join(', ')})` : '';

/** Rechaza con el motivo si `work` no termina a tiempo, en vez de quedar colgado sin avisar. */
function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} sin respuesta tras ${ms / 1000} s${waiting()}`)),
      ms,
    );
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Avance de la descarga de todos los archivos del modelo, de 0 a 1. */
function progressTracker() {
  const files = new Map<string, { loaded: number; total: number }>();
  return (info: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status !== 'progress' || !info.file || !info.total) return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    if (total > 0) post({ type: 'progress', fraction: loaded / total });
  };
}

type Recognizer = (audio: Float32Array, options?: Record<string, unknown>) => Promise<unknown>;
let recognizer: Recognizer | null = null;

const textOf = (out: unknown): string => {
  const first = Array.isArray(out) ? out[0] : out;
  return typeof (first as { text?: unknown })?.text === 'string'
    ? (first as { text: string }).text
    : '';
};

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === 'load') {
      recognizer = (await pipeline('automatic-speech-recognition', MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: progressTracker(),
      })) as unknown as Recognizer;
      // Un segundo de silencio despierta el motor durante la descarga que la persona aceptó.
      await within(recognizer(new Float32Array(16_000)), WARMUP_LIMIT_MS, 'la prueba del modelo');
      post({ type: 'ready' });
    } else if (msg.type === 'run') {
      if (!recognizer) throw new Error('modelo sin cargar');
      const out = await within(
        recognizer(msg.samples, { chunk_length_s: 30 }),
        RUN_LIMIT_MS,
        'el reconocimiento',
      );
      post({ type: 'text', id: msg.id, text: textOf(out) });
    }
  } catch (e) {
    post({ type: 'error', id: msg.type === 'run' ? msg.id : undefined, message: String(e) });
  }
};
