import type { ListenOptions, ListenResult, SpeakOptions, Speech } from '@linguapop/domain';

// Formas mínimas de la Web Speech API; permiten probar con navegadores falsos.
export type VoiceLike = { name: string; lang: string };
export type UtteranceLike = {
  lang: string;
  voice: VoiceLike | null;
  rate: number;
  pitch: number;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};
export type SynthLike = {
  getVoices(): VoiceLike[];
  speak(utterance: UtteranceLike): void;
  cancel(): void;
};
type ResultLike = ArrayLike<{ transcript: string }> & { isFinal: boolean };
export type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ResultLike> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

/** Lo que el navegador ofrece para hablar y escuchar; cada parte puede faltar. */
export type SpeechEnv = {
  synth?: SynthLike | null;
  createUtterance?: ((text: string) => UtteranceLike) | null;
  createRecognition?: (() => RecognitionLike) | null;
};

/** Lee del navegador lo que haya, incluido el prefijo antiguo del reconocimiento de voz. */
export function browserSpeechEnv(): SpeechEnv {
  const g = globalThis as Record<string, unknown>;
  const synth = (g.speechSynthesis as SynthLike | undefined) ?? null;
  const Utterance = g.SpeechSynthesisUtterance as (new (text: string) => UtteranceLike) | undefined;
  const Recognition = (g.SpeechRecognition ?? g.webkitSpeechRecognition) as
    (new () => RecognitionLike) | undefined;
  return {
    synth: synth && Utterance ? synth : null,
    createUtterance: Utterance ? (text) => new Utterance(text) : null,
    createRecognition: Recognition ? () => new Recognition() : null,
  };
}

const FEMALE =
  /(female|samantha|zira|jenny|aria|karen|moira|tessa|serena|victoria|susan|hazel|libby|sonia|catherine|fiona|allison|ava|emma|google us english|google uk english female)/i;

/** La mejor voz en inglés: femenina de EE. UU., luego cualquier femenina, luego de EE. UU., luego inglés. */
export function pickVoice(voices: readonly VoiceLike[]): VoiceLike | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const us = (v: VoiceLike) => /en[-_]US/i.test(v.lang);
  return (
    english.find((v) => FEMALE.test(v.name) && us(v)) ??
    english.find((v) => FEMALE.test(v.name)) ??
    english.find(us) ??
    english[0] ??
    null
  );
}

/** Esperas (milisegundos) del adaptador. */
export const SPEAK_START_DELAY_MS = 60;
export const LISTEN_DEFAULT_TIMEOUT_MS = 11_000;

type Unavailable = Extract<ListenResult, { kind: 'unavailable' }>['reason'];

const PERMANENT_LISTEN_ERRORS: Record<string, Unavailable> = {
  'not-allowed': 'not-allowed',
  'service-not-allowed': 'not-allowed',
  network: 'network',
  'audio-capture': 'no-microphone',
  'language-not-supported': 'unsupported',
};

/**
 * Voz del navegador (AD-11): habla con la síntesis y escucha con el reconocimiento, y degrada en
 * silencio. No usa servicios de voz de terceros: si el navegador no puede, `capabilities()` lo dice
 * y la interfaz ofrece escribir. Las capacidades se corrigen solas al fallar de forma definitiva.
 */
export function createWebSpeech(env: SpeechEnv = browserSpeechEnv()): Speech {
  const { synth = null, createUtterance = null, createRecognition = null } = env;
  let speakBroken = false;
  let listenFailure: Unavailable | null = null;
  let pendingSpeak: { settle: (ok: boolean) => void } | null = null;
  let pendingListen: { settle: (result: ListenResult) => void } | null = null;
  // Se guarda la frase en curso: algunos navegadores la descartan si nadie la referencia.
  let current: UtteranceLike | null = null;

  const canSpeak = () => synth !== null && createUtterance !== null && !speakBroken;
  const canListen = () => createRecognition !== null && listenFailure === null;

  function cancelSpeech() {
    pendingSpeak?.settle(false);
    try {
      synth?.cancel();
    } catch {
      /* sin nada que cancelar */
    }
  }

  function speak(text: string, options: SpeakOptions = {}): Promise<boolean> {
    if (!canSpeak() || !synth || !createUtterance) return Promise.resolve(false);
    cancelSpeech();
    const rate = options.rate ?? 1;
    const pitch = options.pitch ?? 1;

    return new Promise<boolean>((resolve) => {
      const run = (useVoice: boolean) => {
        const utterance = createUtterance(text);
        const voice = useVoice ? pickVoice(synth.getVoices()) : null;
        utterance.lang = voice?.lang ?? 'en-US';
        utterance.voice = voice;
        utterance.rate = rate;
        utterance.pitch = pitch;
        current = utterance;

        let done = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          timers.forEach(clearTimeout);
          if (pendingSpeak === handle) pendingSpeak = null;
          if (current === utterance) current = null;
          resolve(ok);
        };
        const handle = { settle: finish };
        pendingSpeak = handle;

        // Algunos navegadores nunca avisan que terminó: pasado un tiempo razonable se da por dicha.
        timers.push(
          setTimeout(() => finish(true), Math.max(2500, text.length * (110 / rate) + 1500)),
        );
        utterance.onend = () => finish(true);
        utterance.onerror = (event) => {
          const error = event?.error;
          if (error === 'canceled' || error === 'interrupted') return finish(false);
          if (error === 'not-allowed') return finish(false); // el navegador exige un gesto; se puede reintentar
          if (voice) {
            // La voz elegida falló: se reintenta con la que el navegador traiga por defecto.
            done = true;
            timers.forEach(clearTimeout);
            run(false);
            return;
          }
          speakBroken = true; // no hay forma de generar voz en este navegador
          finish(false);
        };
        // Chrome pierde la frase si se pide justo después de cancelar: se espera un instante.
        timers.push(
          setTimeout(() => {
            try {
              synth.speak(utterance);
            } catch {
              speakBroken = true;
              finish(false);
            }
          }, SPEAK_START_DELAY_MS),
        );
      };
      run(true);
    });
  }

  function cancelListening() {
    pendingListen?.settle({ kind: 'silence' });
  }

  function listen(options: ListenOptions = {}): Promise<ListenResult> {
    if (!createRecognition) return Promise.resolve({ kind: 'unavailable', reason: 'unsupported' });
    if (listenFailure) return Promise.resolve({ kind: 'unavailable', reason: listenFailure });
    cancelListening();

    return new Promise<ListenResult>((resolve) => {
      const recognition = createRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.continuous = false;

      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: ListenResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (pendingListen === handle) pendingListen = null;
        resolve(result);
      };
      const handle = {
        settle: (result: ListenResult) => {
          try {
            recognition.abort();
          } catch {
            /* ya estaba detenido */
          }
          finish(result);
        },
      };
      pendingListen = handle;

      recognition.onresult = (event) => {
        if (done) return;
        const last = event.results[event.results.length - 1];
        if (!last) return;
        const alternatives = Array.from(last, (a) => a.transcript);
        if (last.isFinal) finish({ kind: 'heard', alternatives });
        else if (alternatives[0] !== undefined) options.onInterim?.(alternatives[0]);
      };
      recognition.onerror = (event) => {
        if (done) return; // un error tardío no debe marcar el micrófono como averiado
        const error = event?.error ?? 'error';
        const permanent = PERMANENT_LISTEN_ERRORS[error];
        if (permanent) {
          listenFailure = permanent; // las próximas veces ya se sabe que no se puede
          return finish({ kind: 'unavailable', reason: permanent });
        }
        if (error === 'no-speech' || error === 'aborted') return finish({ kind: 'silence' });
        finish({ kind: 'unavailable', reason: 'error' });
      };
      recognition.onend = () => finish({ kind: 'silence' });

      timer = setTimeout(
        () => handle.settle({ kind: 'silence' }),
        options.timeoutMs ?? LISTEN_DEFAULT_TIMEOUT_MS,
      );
      try {
        recognition.start();
      } catch {
        finish({ kind: 'unavailable', reason: 'error' });
      }
    });
  }

  return {
    capabilities: () => ({ canSpeak: canSpeak(), canListen: canListen() }),
    speak,
    listen,
    cancel() {
      cancelSpeech();
      cancelListening();
    },
  };
}
