/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js';

/** Mensajes entre la página y el worker de la voz de respaldo. */
export type ToWorker =
  { type: 'load' } | { type: 'speak'; id: number; text: string; speed: number };
export type FromWorker =
  | { type: 'progress'; fraction: number }
  | { type: 'ready' }
  | { type: 'audio'; id: number; samples: Float32Array; rate: number }
  | { type: 'error'; id?: number; message: string };

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart';
/** Espera máxima (milisegundos) a una frase ya generada y a la de calentamiento de la descarga. */
const SPEAK_LIMIT_MS = 30_000;
const WARMUP_LIMIT_MS = 90_000;
let tts: KokoroTTS | null = null;
const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, transfer);

/**
 * Peticiones de red en curso, para poder decir cuál se quedó esperando si la voz no responde. La
 * biblioteca pide el archivo de la voz en la primera frase, no al cargar el modelo.
 */
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

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === 'load') {
      tts = await KokoroTTS.from_pretrained(MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: progressTracker(),
      });
      // La primera frase baja y guarda el archivo de la voz y despierta el fonemizador: se hace
      // aquí, durante la descarga que la persona aceptó, para que después funcione sin red.
      await within(tts.generate('Hello', { voice: VOICE }), WARMUP_LIMIT_MS, 'la frase de prueba');
      post({ type: 'ready' });
    } else if (msg.type === 'speak') {
      if (!tts) throw new Error('modelo sin cargar');
      const audio = await within(
        tts.generate(msg.text, { voice: VOICE, speed: msg.speed }),
        SPEAK_LIMIT_MS,
        'la voz',
      );
      const samples = audio.audio;
      post({ type: 'audio', id: msg.id, samples, rate: audio.sampling_rate }, [samples.buffer]);
    }
  } catch (e) {
    post({ type: 'error', id: msg.type === 'speak' ? msg.id : undefined, message: String(e) });
  }
};
