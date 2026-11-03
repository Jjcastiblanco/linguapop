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

/** Estado de un modelo que se descarga al dispositivo. */
export type ModelPackState = 'idle' | 'downloading' | 'ready' | 'failed';

/**
 * Modelo de respaldo que pesa decenas de MB (AD-11): nunca se descarga sin que la persona lo pida
 * con `download()`, y una vez descargado queda en el dispositivo.
 */
export interface ModelPack {
  state(): ModelPackState;
  /** Tamaño aproximado de la descarga, en megabytes. */
  sizeMb: number;
  /** Avance de la descarga, de 0 a 1; solo tiene sentido mientras `state()` es `downloading`. */
  progress(): number;
  /** Por qué falló la última descarga o uso, o `null` si va bien. Sirve para mostrarlo. */
  error(): string | null;
  /** Avisa cuando cambia el estado, el avance o el error; devuelve cómo dejar de escuchar. */
  subscribe(listener: () => void): () => void;
  /** Descarga y prepara el modelo; devuelve si quedó listo. */
  download(): Promise<boolean>;
}

/** Voz de entrada y salida (AD-11): siempre degrada, nunca bloquea una lección. */
export interface Speech {
  capabilities(): SpeechCapabilities;
  /** Termina al acabar la frase; devuelve false si no se pudo reproducir. */
  speak(text: string, options?: SpeakOptions): Promise<boolean>;
  listen(options?: ListenOptions): Promise<ListenResult>;
  cancel(): void;
  /** Solo existe si el navegador puede ofrecer reconocimiento de voz en el dispositivo. */
  recognitionPack?: ModelPack;
}
