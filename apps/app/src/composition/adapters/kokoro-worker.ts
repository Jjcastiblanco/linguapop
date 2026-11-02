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
let tts: KokoroTTS | null = null;
const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, transfer);

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
      post({ type: 'ready' });
    } else if (msg.type === 'speak') {
      if (!tts) throw new Error('modelo sin cargar');
      const audio = await tts.generate(msg.text, { voice: VOICE, speed: msg.speed });
      const samples = audio.audio;
      post({ type: 'audio', id: msg.id, samples, rate: audio.sampling_rate }, [samples.buffer]);
    }
  } catch (e) {
    post({ type: 'error', id: msg.type === 'speak' ? msg.id : undefined, message: String(e) });
  }
};
