import type { SpeakOptions, Speech, VoicePack, VoicePackState } from '@linguapop/domain';
import { pickVoice, type SpeechEnv } from './web-speech';

/** El motor de voz de respaldo: se carga una vez y habla sin depender de las voces del sistema. */
export type TtsEngine = {
  /** Descarga (la primera vez) y prepara el modelo; `onProgress` recibe de 0 a 1. */
  load(onProgress: (fraction: number) => void): Promise<void>;
  /** Termina al acabar de sonar; devuelve false si no se pudo reproducir. */
  speak(text: string, options?: SpeakOptions): Promise<boolean>;
  cancel(): void;
};

/** Dónde se recuerda que la voz ya se descargó (por dispositivo). */
export type PackStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const VOICE_PACK_KEY = 'linguapop:voicepack:v1';

/** Tiempo (milisegundos) que se espera a que el navegador publique sus voces antes de darlas por vacías. */
export const VOICES_GRACE_MS = 1500;

export type VoicePackController = VoicePack & {
  speak(text: string, options?: SpeakOptions): Promise<boolean>;
  cancel(): void;
};

/**
 * Estado de la voz de respaldo. Solo descarga cuando alguien llama a `download()`. Si ya se
 * descargó en una visita anterior arranca como `ready` y carga el modelo, desde la caché del
 * navegador, en el primer uso; si esa carga falla, vuelve a `idle` para poder bajarla de nuevo.
 */
export function createVoicePack(
  engine: TtsEngine,
  sizeMb: number,
  storage: PackStorage | null = safeStorage(),
): VoicePackController {
  const listeners = new Set<() => void>();
  let state: VoicePackState = read(storage) ? 'ready' : 'idle';
  let progress = 0;
  let loaded: Promise<void> | null = null;
  let downloading: Promise<boolean> | null = null;

  const notify = () => listeners.forEach((l) => l());
  const set = (next: VoicePackState, nextProgress = progress) => {
    state = next;
    progress = nextProgress;
    notify();
  };
  const ensureLoaded = () => {
    loaded ??= engine.load((f) => {
      if (state !== 'downloading') return;
      progress = Math.min(1, Math.max(0, f));
      notify();
    });
    return loaded;
  };

  return {
    sizeMb,
    state: () => state,
    progress: () => progress,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    download() {
      if (state === 'ready') return Promise.resolve(true);
      downloading ??= (async () => {
        set('downloading', 0);
        try {
          await ensureLoaded();
          write(storage, true);
          set('ready', 1);
          return true;
        } catch {
          loaded = null;
          set('failed', 0);
          return false;
        } finally {
          downloading = null;
        }
      })();
      return downloading;
    },
    async speak(text, options) {
      if (state !== 'ready') return false;
      try {
        await ensureLoaded();
        return await engine.speak(text, options);
      } catch {
        // La copia guardada ya no sirve (caché borrada): se pide de nuevo en vez de quedar muda.
        loaded = null;
        write(storage, false);
        set('idle', 0);
        return false;
      }
    },
    cancel: () => engine.cancel(),
  };
}

function safeStorage(): PackStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function read(storage: PackStorage | null): boolean {
  try {
    return storage?.getItem(VOICE_PACK_KEY) === '1';
  } catch {
    return false;
  }
}
function write(storage: PackStorage | null, on: boolean) {
  try {
    if (on) storage?.setItem(VOICE_PACK_KEY, '1');
    else storage?.removeItem(VOICE_PACK_KEY);
  } catch {
    /* sin almacenamiento: se vuelve a preguntar en la próxima visita */
  }
}

/**
 * ¿El navegador puede hablar en inglés con sus propias voces? Las voces llegan tarde en algunos
 * navegadores, así que una lista vacía cuenta como «todavía no se sabe» durante un rato.
 */
export function nativeEnglishVoice(env: SpeechEnv, since: number, now: () => number): boolean {
  const { synth, createUtterance } = env;
  if (!synth || !createUtterance) return false;
  let voices;
  try {
    voices = synth.getVoices();
  } catch {
    return false;
  }
  if (voices.length === 0) return now() - since < VOICES_GRACE_MS;
  return pickVoice(voices) !== null;
}

/**
 * Une la voz del navegador con la de respaldo: habla con la del sistema si tiene voz en inglés y
 * con la descargada si no. Sin ninguna de las dos `canSpeak` es falso y la interfaz ofrece bajarla.
 */
export function withVoicePack(
  base: Speech,
  pack: VoicePackController,
  hasNativeVoice: () => boolean,
): Speech {
  const nativeOk = () => base.capabilities().canSpeak && hasNativeVoice();
  return {
    capabilities: () => ({
      canSpeak: nativeOk() || pack.state() === 'ready',
      canListen: base.capabilities().canListen,
    }),
    async speak(text, options) {
      if (nativeOk()) {
        const ok = await base.speak(text, options);
        if (ok || nativeOk()) return ok; // si la voz del sistema se dio por averiada, se prueba la otra
      }
      return pack.speak(text, options);
    },
    listen: (options) => base.listen(options),
    cancel() {
      base.cancel();
      pack.cancel();
    },
    voicePack: pack,
  };
}
