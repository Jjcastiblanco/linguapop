import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import type { ListenOptions, ListenResult, SpeakOptions, Speech } from '@linguapop/domain';
import { translateListenError } from './speech-errors';

/** Lo que el adaptador usa de los plugins; las pruebas lo reemplazan por uno falso. */
export type NativeSpeechPlugins = {
  recognition: Pick<
    typeof SpeechRecognition,
    'checkPermissions' | 'requestPermissions' | 'start' | 'stop'
  >;
  tts: Pick<typeof TextToSpeech, 'speak' | 'stop'>;
};

/** Espera (milisegundos) por defecto antes de dar la escucha por silencio, igual que en la web. */
export const NATIVE_LISTEN_DEFAULT_TIMEOUT_MS = 11_000;

const LANG = 'en-US';
const MAX_ALTERNATIVES = 3;

/**
 * Voz del APK (AD-19, AD-20): reconocimiento y síntesis nativos de Android detrás del puerto
 * `Speech`. El permiso se pide una sola vez, en la primera escucha; sin permiso o sin servicio la
 * escucha queda `unavailable` hasta cerrar la app y la lección pasa a escribir. El estado es de la
 * instancia, no del módulo. Solo la síntesis fallida da `false`: nunca bloquea una lección.
 */
export function createNativeSpeech(
  plugins: NativeSpeechPlugins = { recognition: SpeechRecognition, tts: TextToSpeech },
): Speech {
  const { recognition, tts } = plugins;
  let failure: Extract<ListenResult, { kind: 'unavailable' }> | null = null;
  let permission: Promise<boolean> | null = null;
  let pending: { settle: (result: ListenResult) => void } | null = null;

  /** Pregunta por el permiso una sola vez por sesión; la respuesta se recuerda, sea cual sea. */
  function ensurePermission(): Promise<boolean> {
    permission ??= (async () => {
      try {
        let status = await recognition.checkPermissions();
        if (status.speechRecognition !== 'granted') status = await recognition.requestPermissions();
        return status.speechRecognition === 'granted';
      } catch {
        return false;
      }
    })();
    return permission;
  }

  function stopRecognition() {
    recognition.stop().catch(() => undefined);
  }

  function cancelListening() {
    pending?.settle({ kind: 'silence' });
  }

  async function speak(text: string, options: SpeakOptions = {}): Promise<boolean> {
    try {
      await tts.stop().catch(() => undefined);
      await tts.speak({ text, lang: LANG, rate: options.rate ?? 1, pitch: options.pitch ?? 1 });
      return true;
    } catch {
      return false;
    }
  }

  function listen(options: ListenOptions = {}): Promise<ListenResult> {
    if (failure) return Promise.resolve(failure);
    cancelListening();

    return new Promise<ListenResult>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: ListenResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (pending === handle) pending = null;
        resolve(result);
      };
      const handle = {
        settle: (result: ListenResult) => {
          if (done) return;
          stopRecognition();
          finish(result);
        },
      };
      pending = handle;

      void ensurePermission().then(async (granted) => {
        if (done) return;
        if (!granted) {
          failure = { kind: 'unavailable', reason: 'not-allowed' };
          return finish(failure);
        }
        // El tiempo corre desde que se empieza a oír, no mientras el sistema pregunta por el permiso.
        timer = setTimeout(
          () => handle.settle({ kind: 'silence' }),
          options.timeoutMs ?? NATIVE_LISTEN_DEFAULT_TIMEOUT_MS,
        );
        try {
          const { matches } = await recognition.start({
            language: LANG,
            maxResults: MAX_ALTERNATIVES,
            partialResults: false,
            popup: false,
          });
          const alternatives = (matches ?? []).filter((m) => m.trim() !== '');
          finish(alternatives.length > 0 ? { kind: 'heard', alternatives } : { kind: 'silence' });
        } catch (error) {
          const { result, permanent } = translateListenError(error);
          if (permanent && result.kind === 'unavailable') failure = result;
          finish(result);
        }
      });
    });
  }

  return {
    capabilities: () => ({ canSpeak: true, canListen: failure === null }),
    speak,
    listen,
    cancel() {
      void tts.stop().catch(() => undefined);
      cancelListening();
    },
  };
}
