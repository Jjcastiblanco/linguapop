export type SpeechCapabilities = {
  /** Hay forma de reproducir voz (nativa o de respaldo). */
  canSpeak: boolean;
  /** Hay reconocimiento de voz disponible. */
  canListen: boolean;
};

export type ListenResult =
  /** Se entendió algo; las alternativas van de la más probable a la menos. */
  | { kind: 'heard'; alternatives: string[] }
  /** No se oyó nada dentro del tiempo. */
  | { kind: 'silence' }
  /** No se puede escuchar: sin permiso, sin soporte o sin red. */
  | {
      kind: 'unavailable';
      reason: 'not-allowed' | 'unsupported' | 'network' | 'no-microphone' | 'error';
    };

export type SpeakOptions = {
  /** 1 es la velocidad normal; menos de 1 es más lento. */
  rate?: number;
  pitch?: number;
};

/** Voz de entrada y salida (AD-11): siempre degrada, nunca bloquea una lección. */
export interface Speech {
  capabilities(): SpeechCapabilities;
  /** Termina al acabar la frase; devuelve false si no se pudo reproducir. */
  speak(text: string, options?: SpeakOptions): Promise<boolean>;
  listen(options?: { timeoutMs?: number }): Promise<ListenResult>;
  cancel(): void;
}
