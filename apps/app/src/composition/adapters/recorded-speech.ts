import { audioKey, speedFor, type AudioManifest } from '@linguapop/content';
import type { ListenOptions, SpeakOptions, Speech } from '@linguapop/domain';

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
      let key = audioKey(text, speed);
      if (!keys.has(key) && speed === 'slow') {
        // Las palabras sueltas no tienen versión lenta: se estira la normal.
        key = audioKey(text, 'normal');
        playbackRate = wanted;
        speed = 'normal';
      }
      if (keys.has(key)) {
        try {
          return (await env.player.play(`${env.baseUrl}${key}.mp3`, playbackRate)) === 'ended';
        } catch {
          /* no se pudo reproducir el archivo: lo dice la voz de respaldo */
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
