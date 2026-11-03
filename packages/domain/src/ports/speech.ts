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

export type ListenOptions = {
  /** Tiempo máximo esperando a que el estudiante hable, en milisegundos. */
  timeoutMs?: number;
  /** Se llama con lo que se va entendiendo mientras habla (para mostrarlo en pantalla). */
  onInterim?: (text: string) => void;
};

/** Estado de la voz de respaldo que se descarga al dispositivo. */
export type VoicePackState = 'idle' | 'downloading' | 'ready' | 'failed';

/**
 * Voz de respaldo para navegadores sin voz en inglés (AD-11): pesa decenas de MB, así que nunca se
 * descarga sin que la persona lo pida con `download()`. Una vez descargada queda en el dispositivo.
 */
export interface VoicePack {
  state(): VoicePackState;
  /** Tamaño aproximado de la descarga, en megabytes. */
  sizeMb: number;
  /** Avance de la descarga, de 0 a 1; solo tiene sentido mientras `state()` es `downloading`. */
  progress(): number;
  /** Avisa cuando cambia el estado o el avance; devuelve cómo dejar de escuchar. */
  subscribe(listener: () => void): () => void;
  /** Descarga y prepara la voz; devuelve si quedó lista. */
  download(): Promise<boolean>;
  /** Por qué falló la última frase o la carga, o `null` si va bien. Sirve para mostrarlo. */
  error(): string | null;
  /** La persona eligió esta voz aunque el navegador tenga una propia (p. ej. porque no suena). */
  preferred(): boolean;
  setPreferred(on: boolean): void;
}

/** Voz de entrada y salida (AD-11): siempre degrada, nunca bloquea una lección. */
export interface Speech {
  /** Solo existe si el navegador puede ofrecer la voz de respaldo. */
  capabilities(): SpeechCapabilities;
  /** Termina al acabar la frase; devuelve false si no se pudo reproducir. */
  speak(text: string, options?: SpeakOptions): Promise<boolean>;
  listen(options?: ListenOptions): Promise<ListenResult>;
  cancel(): void;
  voicePack?: VoicePack;
}
