// Voz de las grabaciones del curso: Kokoro 82M en Node y un MP3 de 40 kbps. Lo comparten
// `generar-audio.mjs` (audio empaquetado) y `publicar-contenido.mjs` (audio publicado), para que
// una misma clave suene igual venga de donde venga.
import { Mp3Encoder } from '@breezystack/lamejs';
import { KokoroTTS } from 'kokoro-js';
import { DEFAULT_VOICE } from '../../packages/content/src/audio.ts';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** Velocidad de Kokoro de cada grabación; la lenta coincide con la tortuga de la app. */
const KOKORO_SPEED = { normal: 1, slow: 0.6 };
const KBPS = 40;

export function encodeMp3(samples, rate) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
  }
  const encoder = new Mp3Encoder(1, rate, KBPS);
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const part = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
    if (part.length) chunks.push(Buffer.from(part));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

/** Carga el modelo una vez; devuelve `({ text, speed, voice }) => Buffer` con el MP3. */
export async function loadSynthesizer() {
  const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'cpu' });
  return async ({ text, speed, voice }) => {
    const audio = await tts.generate(text, {
      voice: voice ?? DEFAULT_VOICE,
      speed: KOKORO_SPEED[speed],
    });
    return encodeMp3(audio.audio, audio.sampling_rate);
  };
}
