import type { SpeakOptions, Speech, VoicePack, VoicePackState } from '@linguapop/domain';
import { pickVoice, type SpeechEnv } from './web-speech';

/** El motor de voz de respaldo: se carga una vez y habla sin depender de las voces del sistema. */
export type TtsEngine = {
  /** Descarga (la primera vez) y prepara el modelo; `onProgress` recibe de 0 a 1. */
  load(onProgress: (fraction: number) => void): Promise<void>;
  /** Termina al acabar de sonar; devuelve false si otra frase la cortó y lanza si no pudo sonar. */
  speak(text: string, options?: SpeakOptions): Promise<boolean>;
  cancel(): void;
};

/** Dónde se recuerda que la voz ya se descargó (por dispositivo). */
export type PackStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const VOICE_PACK_KEY = 'linguapop:voicepack:v1';
/** Dónde se recuerda que la persona prefiere esta voz a la del navegador. */
export const VOICE_PREFER_KEY = 'linguapop:voicepack:prefer:v1';

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
  let state: VoicePackState = read(storage, VOICE_PACK_KEY) ? 'ready' : 'idle';
  let preferred = read(storage, VOICE_PREFER_KEY);
  let progress = 0;
  let lastError: string | null = null;
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
    error: () => lastError,
    preferred: () => preferred,
    setPreferred(on) {
      if (on === preferred) return;
      preferred = on;
      write(storage, VOICE_PREFER_KEY, on);
      notify();
    },
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
          write(storage, VOICE_PACK_KEY, true);
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
      } catch (e) {
        // La copia guardada ya no sirve (caché borrada): se pide de nuevo en vez de quedar muda.
        loaded = null;
        write(storage, VOICE_PACK_KEY, false);
        lastError = describe(e);
        set('idle', 0);
        return false;
      }
      try {
        const ok = await engine.speak(text, options);
        if (ok && lastError !== null) {
          lastError = null;
          notify();
        }
        return ok;
      } catch (e) {
        // La voz está cargada pero no pudo sonar: se guarda el motivo para mostrarlo.
        lastError = describe(e);
        notify();
        return false;
      }
    },
    cancel: () => engine.cancel(),
  };
}

const describe = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)) || 'error desconocido';

function safeStorage(): PackStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function read(storage: PackStorage | null, key: string): boolean {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}
function write(storage: PackStorage | null, key: string, on: boolean) {
  try {
    if (on) storage?.setItem(key, '1');
    else storage?.removeItem(key);
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
  // La de respaldo habla si ya está lista y la persona la prefirió, o si el navegador no puede.
  const usePack = () => pack.state() === 'ready' && (pack.preferred() || !nativeOk());
  return {
    capabilities: () => ({
      canSpeak: nativeOk() || pack.state() === 'ready',
      canListen: base.capabilities().canListen,
    }),
    async speak(text, options) {
      if (usePack()) return pack.speak(text, options);
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
