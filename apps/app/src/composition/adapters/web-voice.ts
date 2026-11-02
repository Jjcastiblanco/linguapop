import type { Speech } from '@linguapop/domain';
import { createKokoroEngine, KOKORO_SIZE_MB } from './kokoro-engine';
import { createVoicePack, nativeEnglishVoice, withVoicePack } from './voice-pack';
import { browserSpeechEnv, createWebSpeech, type SpeechEnv } from './web-speech';

/** El navegador puede correr la voz de respaldo (worker, audio y WebAssembly). */
const canRunFallback = () =>
  typeof Worker !== 'undefined' &&
  typeof AudioContext !== 'undefined' &&
  typeof WebAssembly !== 'undefined';

/**
 * Voz de la web: la del navegador y, si el equipo no tiene voz en inglés, una de respaldo que se
 * descarga solo cuando la persona lo acepta. El reconocimiento sigue siendo el del navegador.
 */
export function createBrowserSpeech(env: SpeechEnv = browserSpeechEnv()): Speech {
  const base = createWebSpeech(env);
  if (!canRunFallback()) return base;
  const since = Date.now();
  const pack = createVoicePack(createKokoroEngine(), KOKORO_SIZE_MB);
  return withVoicePack(base, pack, () => nativeEnglishVoice(env, since, Date.now));
}
