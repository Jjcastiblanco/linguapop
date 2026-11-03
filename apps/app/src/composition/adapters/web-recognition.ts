import type { ListenOptions, ListenResult, Speech } from '@linguapop/domain';
import { cleanTranscript } from './endpoint';
import { createModelPack } from './model-pack';
import { recordUtterance, type RecordOptions, type Utterance } from './mic-recorder';
import { createWhisperEngine, WHISPER_SIZE_MB, type WhisperEngine } from './whisper-engine';

export const RECOGNITION_KEY = 'linguapop:recognition-pack:v1';
/** Misma espera que el reconocimiento del navegador. */
export const RECOGNITION_WAIT_MS = 11_000;
/** Una frase de la lección no pasa de esto aunque la persona siga hablando. */
export const RECOGNITION_MAX_MS = 15_000;

/** Lo que el adaptador usa del micrófono; las pruebas lo reemplazan por uno falso. */
export type Recorder = (options: RecordOptions) => Promise<Utterance>;

const canRunRecognition = () =>
  typeof Worker !== 'undefined' &&
  typeof WebAssembly !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

/**
 * Reconocimiento de voz de respaldo para navegadores que no tienen el suyo (Firefox) o no pueden
 * usarlo (Brave): graba hasta que la persona calla y transcribe en el dispositivo con Whisper.
 * Solo se usa si la persona descargó el modelo; mientras tanto `base` decide, y la interfaz
 * ofrece la descarga cuando `base` dice que no puede escuchar.
 */
export function withWhisperRecognition(
  base: Speech,
  deps: { engine?: WhisperEngine; record?: Recorder } = {},
): Speech {
  if (!deps.engine && !canRunRecognition()) return base;
  const { pack, use } = createModelPack(
    deps.engine ?? createWhisperEngine(),
    WHISPER_SIZE_MB,
    RECOGNITION_KEY,
  );
  const record = deps.record ?? recordUtterance;
  let current: AbortController | null = null;

  const whisperListen = async (options: ListenOptions): Promise<ListenResult> => {
    current?.abort();
    const controller = new AbortController();
    current = controller;
    try {
      const heard = await record({
        waitMs: options.timeoutMs ?? RECOGNITION_WAIT_MS,
        maxMs: RECOGNITION_MAX_MS,
        signal: controller.signal,
      });
      if (heard.kind === 'silence') return { kind: 'silence' };
      if (heard.kind === 'unavailable') return heard;
      const text = cleanTranscript(await use((engine) => engine.transcribe(heard.samples)));
      if (controller.signal.aborted) return { kind: 'silence' };
      return text ? { kind: 'heard', alternatives: [text] } : { kind: 'silence' };
    } catch {
      return { kind: 'unavailable', reason: 'error' }; // el motivo queda en `pack.error()`
    } finally {
      if (current === controller) current = null;
    }
  };

  const baseCanListen = () => base.capabilities().canListen;
  return {
    capabilities: () => ({
      canSpeak: base.capabilities().canSpeak,
      canListen: baseCanListen() || pack.state() === 'ready',
    }),
    speak: (text, options) => base.speak(text, options),
    async listen(options = {}) {
      if (!baseCanListen() && pack.state() === 'ready') return whisperListen(options);
      const result = await base.listen(options);
      // El servicio del navegador falló de forma definitiva: si hay modelo, se prueba con él.
      const serviceDown =
        result.kind === 'unavailable' &&
        (result.reason === 'network' || result.reason === 'unsupported');
      return serviceDown && pack.state() === 'ready' ? whisperListen(options) : result;
    },
    cancel() {
      current?.abort();
      base.cancel();
    },
    recognitionPack: pack,
  };
}
