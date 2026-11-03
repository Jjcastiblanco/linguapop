/** Decisión del detector de fin de frase tras cada medida del volumen. */
export type EndpointDecision = 'continue' | 'speech-ended' | 'no-speech';

export type EndpointOptions = {
  /** Volumen (RMS, de 0 a 1) por encima del cual se considera que alguien habla. */
  threshold?: number;
  /** Silencio (milisegundos) tras hablar con el que se da la frase por terminada. */
  silenceMs?: number;
  /** Habla mínima (milisegundos) para contar como frase y no como un ruido. */
  minSpeechMs?: number;
  /** Espera máxima (milisegundos) a que alguien empiece a hablar. */
  waitMs: number;
};

export const DEFAULT_THRESHOLD = 0.02;
export const DEFAULT_SILENCE_MS = 1200;
export const DEFAULT_MIN_SPEECH_MS = 250;

/**
 * Detector de fin de frase para grabar sin que la persona tenga que parar: alimentado con el
 * volumen cada pocas decenas de milisegundos, dice cuándo terminó de hablar o que nunca habló.
 * Es una función pura de las medidas, sin reloj ni audio, para poder probarla.
 */
export function createEndpointDetector(options: EndpointOptions) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const minSpeechMs = options.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS;
  let startedAt: number | null = null; // primera medida
  let speechStart: number | null = null;
  let lastLoud: number | null = null;

  return {
    /** `rms` es el volumen de esta medida y `nowMs` el instante en que se tomó. */
    feed(rms: number, nowMs: number): EndpointDecision {
      startedAt ??= nowMs;
      if (rms >= threshold) {
        speechStart ??= nowMs;
        lastLoud = nowMs;
      }
      if (speechStart === null) {
        return nowMs - startedAt >= options.waitMs ? 'no-speech' : 'continue';
      }
      const spoke = lastLoud! - speechStart;
      if (nowMs - lastLoud! >= silenceMs)
        return spoke >= minSpeechMs ? 'speech-ended' : 'no-speech';
      return 'continue';
    },
    /** Si hubo habla suficiente (para decidir qué hacer al cortar por tiempo máximo). */
    heardSpeech: () => speechStart !== null && lastLoud! - speechStart >= minSpeechMs,
  };
}

/** Quita lo que Whisper escribe cuando no entiende (`[BLANK_AUDIO]`, `(music)`) y deja el texto. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
