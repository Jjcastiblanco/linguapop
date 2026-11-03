import { createEndpointDetector, DEFAULT_MIN_SPEECH_MS, type EndpointOptions } from './endpoint';

export type Utterance =
  | { kind: 'audio'; samples: Float32Array }
  | { kind: 'silence' }
  | { kind: 'unavailable'; reason: 'not-allowed' | 'no-microphone' | 'error' };

export type RecordOptions = Pick<EndpointOptions, 'waitMs'> & {
  /** Límite (milisegundos) de lo que dura la grabación aunque la persona siga hablando. */
  maxMs: number;
  /** Aviso para cortar la grabación; resuelve como silencio. */
  signal: AbortSignal;
};

/** Frecuencia de muestreo que espera Whisper. */
export const TARGET_RATE = 16_000;
const POLL_MS = 50;

const reasonOf = (e: unknown): 'not-allowed' | 'no-microphone' | 'error' => {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-microphone';
  return 'error';
};

/** Convierte lo grabado (webm, ogg o mp4) a audio mono de 16 kHz. */
async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * TARGET_RATE),
      TARGET_RATE,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    void ctx.close();
  }
}

/**
 * Graba una frase del micrófono: empieza al llamar, termina cuando la persona deja de hablar (o
 * al tiempo máximo) y devuelve el audio listo para transcribir. Sin habla devuelve silencio y no
 * hace falta transcribir nada. Pide el permiso del micrófono la primera vez.
 */
export async function recordUtterance(options: RecordOptions): Promise<Utterance> {
  if (options.signal.aborted) return { kind: 'silence' };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    return { kind: 'unavailable', reason: reasonOf(e) };
  }

  const meter = new AudioContext();
  try {
    const analyser = meter.createAnalyser();
    analyser.fftSize = 1024;
    meter.createMediaStreamSource(stream).connect(analyser);
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start();

    const detector = createEndpointDetector({ waitMs: options.waitMs });
    const buffer = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    const outcome = await new Promise<'speech-ended' | 'no-speech' | 'max' | 'aborted'>(
      (resolve) => {
        const finish = (r: 'speech-ended' | 'no-speech' | 'max' | 'aborted') => {
          clearInterval(timer);
          options.signal.removeEventListener('abort', onAbort);
          resolve(r);
        };
        const onAbort = () => finish('aborted');
        options.signal.addEventListener('abort', onAbort);
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (const v of buffer) sum += v * v;
          const now = performance.now();
          const decision = detector.feed(Math.sqrt(sum / buffer.length), now);
          if (decision !== 'continue') finish(decision);
          else if (now - startedAt >= options.maxMs) finish('max');
        }, POLL_MS);
      },
    );

    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    const heard = outcome === 'speech-ended' || (outcome === 'max' && detector.heardSpeech());
    if (!heard) return { kind: 'silence' };
    const samples = await decodeTo16k(new Blob(chunks, { type: recorder.mimeType }));
    // Una grabación casi vacía no merece transcribirse.
    return samples.length < (TARGET_RATE * DEFAULT_MIN_SPEECH_MS) / 1000
      ? { kind: 'silence' }
      : { kind: 'audio', samples };
  } catch {
    return { kind: 'unavailable', reason: 'error' };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    void meter.close();
  }
}
