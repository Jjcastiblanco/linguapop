import { audioKey, DEFAULT_VOICE, speedFor, type AudioManifest } from '@linguapop/content';
import type { ListenOptions, SpeakOptions, Speech } from '@linguapop/domain';
import { browserClipCache, createRemoteClips, type RemoteClips } from './remote-clips';

/** Reproduce un archivo de audio; `stop` lo corta. */
export type ClipPlayer = {
  /** Termina al acabar (`ended`) o al cortarlo (`stopped`); lanza si no pudo sonar. */
  play(url: string, playbackRate: number): Promise<'ended' | 'stopped'>;
  stop(): void;
};

/** Lo que el adaptador usa del entorno; las pruebas lo reemplazan por uno falso. */
export type RecordingsEnv = {
  /** Las claves con grabación (`audio/manifest.json`); lanza si no se pudo leer. */
  loadManifest(): Promise<readonly string[]>;
  player: ClipPlayer;
  /** Dónde viven los archivos, con la barra final: `/audio/`. */
  baseUrl: string;
  /** Clips que publica el snapshot y no vienen empaquetados; opcional. */
  remote?: RemoteClips;
};

export function browserRecordingsEnv(): RecordingsEnv {
  const baseUrl = `${import.meta.env.BASE_URL}audio/`;
  let current: HTMLAudioElement | null = null;
  let finish: ((result: 'ended' | 'stopped') => void) | null = null;
  const stop = () => {
    current?.pause();
    current = null;
    finish?.('stopped');
    finish = null;
  };
  return {
    baseUrl,
    remote: createRemoteClips({ openCache: browserClipCache }),
    async loadManifest() {
      const response = await fetch(`${baseUrl}manifest.json`);
      if (!response.ok) throw new Error(`manifest ${response.status}`);
      return ((await response.json()) as AudioManifest).keys;
    },
    player: {
      stop,
      play(url, playbackRate) {
        stop();
        const audio = new Audio(url);
        audio.playbackRate = playbackRate;
        audio.preservesPitch = true;
        return new Promise((resolve, reject) => {
          current = audio;
          finish = resolve;
          audio.onended = () => {
            if (current === audio) {
              current = null;
              finish = null;
            }
            resolve('ended');
          };
          audio.onerror = () => reject(new Error('no se pudo cargar el audio'));
          audio.play().catch(reject);
        });
      },
    },
  };
}

/**
 * Voz pregrabada del curso (AD-11): lo que la app dice del curso suena desde archivos generados
 * con anticipación, al instante y sin red una vez guardados. Lo que no tiene grabación (frases
 * libres, un archivo que falta o no carga) lo dice la voz de respaldo `base`, y escuchar siempre
 * es de `base`. El manifiesto se lee una vez al crear el adaptador.
 */
export function withRecordings(base: Speech, env: RecordingsEnv): Speech {
  let keys: ReadonlySet<string> = new Set();
  const ready = env
    .loadManifest()
    .then((list) => void (keys = new Set(list)))
    .catch(() => undefined); // sin manifiesto, todo lo dice la voz de respaldo

  return {
    capabilities: () => ({
      canSpeak: keys.size > 0 || base.capabilities().canSpeak,
      canListen: base.capabilities().canListen,
    }),
    async speak(text: string, options: SpeakOptions = {}) {
      await ready;
      const wanted = options.rate ?? 1;
      let { speed, playbackRate } = speedFor(wanted);
      // Lo empaquetado manda; lo que publicó el snapshot completa lo que falta.
      const have = (k: string) => keys.has(k) || (env.remote?.has(k) ?? false);
      let key = audioKey(text, speed, options.voice);
      if (!have(key) && speed === 'slow') {
        // Las palabras sueltas no tienen versión lenta: se estira la normal.
        key = audioKey(text, 'normal', options.voice);
        playbackRate = wanted;
        speed = 'normal';
      }
      // Sin la grabación de esa voz suena la voz por defecto del curso.
      if (!have(key) && options.voice && options.voice !== DEFAULT_VOICE) {
        key = audioKey(text, speed, DEFAULT_VOICE);
      }
      if (have(key)) {
        try {
          const url = keys.has(key) ? `${env.baseUrl}${key}.mp3` : await env.remote!.urlOf(key);
          return (await env.player.play(url, playbackRate)) === 'ended';
        } catch {
          /* no se pudo reproducir el archivo: se prueba lo empaquetado y, si no, la voz de respaldo */
        }
        if (!keys.has(key)) {
          const packaged = [
            audioKey(text, 'normal', options.voice),
            audioKey(text, 'normal', DEFAULT_VOICE),
          ].find((k) => keys.has(k));
          if (packaged) {
            try {
              return (await env.player.play(`${env.baseUrl}${packaged}.mp3`, wanted)) === 'ended';
            } catch {
              /* también falló: voz de respaldo */
            }
          }
        }
      }
      return base.speak(text, options);
    },
    listen: (options?: ListenOptions) => base.listen(options),
    cancel() {
      env.player.stop();
      base.cancel();
    },
    ...(base.recognitionPack ? { recognitionPack: base.recognitionPack } : {}),
  };
}
