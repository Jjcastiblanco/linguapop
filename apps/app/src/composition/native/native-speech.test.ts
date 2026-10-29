import { describe, expect, it, vi } from 'vitest';
import { runSpeechContract } from '../adapters/speech-contract';
import { createNativeSpeech, type NativeSpeechPlugins } from './native-speech';
import { translateListenError } from './speech-errors';

type Granted = 'granted' | 'denied' | 'prompt';

/** Plugins falsos: `start` queda abierto hasta que la prueba lo resuelve o lo rechaza. */
function fakePlugins(initial: Granted = 'granted', afterRequest: Granted = 'granted') {
  let current: Granted = initial;
  let resolveStart: (value: { matches?: string[] }) => void = () => undefined;
  let rejectStart: (error: unknown) => void = () => undefined;
  const recognition = {
    checkPermissions: vi.fn(async () => ({ speechRecognition: current })),
    requestPermissions: vi.fn(async () => {
      current = afterRequest;
      return { speechRecognition: current };
    }),
    start: vi.fn(
      () =>
        new Promise<{ matches?: string[] }>((resolve, reject) => {
          resolveStart = resolve;
          rejectStart = reject;
        }),
    ),
    stop: vi.fn(async () => {
      rejectStart({ message: 'Recognition stopped before final results were produced.' });
    }),
  };
  const tts = { speak: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
  const plugins = { recognition, tts } as unknown as NativeSpeechPlugins;
  return {
    plugins,
    recognition,
    tts,
    heard: (matches: string[]) => resolveStart({ matches }),
    fail: (error: unknown) => rejectStart(error),
  };
}

/** Deja correr las promesas pendientes (permiso y arranque) sin mover los temporizadores. */
const flush = () => vi.advanceTimersByTimeAsync(0);

runSpeechContract('nativo', () => {
  const fake = fakePlugins();
  return {
    speech: createNativeSpeech(fake.plugins),
    driver: {
      emitHeard: (alternatives) => void flush().then(() => fake.heard(alternatives)),
      emitNoMatch: () =>
        void flush().then(() => fake.fail({ code: 'NO_MATCH', message: 'No match' })),
      denyPermission: () => void flush().then(() => fake.fail({ message: 'Missing permission' })),
    },
  };
});

describe('adaptador nativo de voz', () => {
  it('pide el idioma inglés y hasta tres alternativas', async () => {
    vi.useFakeTimers();
    const fake = fakePlugins();
    const pending = createNativeSpeech(fake.plugins).listen();
    await flush();
    expect(fake.recognition.start).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en-US', maxResults: 3 }),
    );
    fake.heard(['hello']);
    await pending;
    vi.useRealTimers();
  });

  it('sin coincidencia ni habla da silencio, y sin alternativas también', async () => {
    vi.useFakeTimers();
    for (const error of [
      { code: 'NO_MATCH', message: 'No match' },
      { code: 'SPEECH_TIMEOUT', message: 'No speech input' },
    ]) {
      const fake = fakePlugins();
      const pending = createNativeSpeech(fake.plugins).listen();
      await flush();
      fake.fail(error);
      expect(await pending).toEqual({ kind: 'silence' });
    }
    const fake = fakePlugins();
    const pending = createNativeSpeech(fake.plugins).listen();
    await flush();
    fake.heard(['  ']);
    expect(await pending).toEqual({ kind: 'silence' });
    vi.useRealTimers();
  });

  it('el temporizador corta con stop() y no cuenta el tiempo del permiso', async () => {
    vi.useFakeTimers();
    const fake = fakePlugins('prompt');
    let slow: () => void = () => undefined;
    fake.recognition.requestPermissions.mockImplementation(
      () =>
        new Promise((resolve) => {
          slow = () => resolve({ speechRecognition: 'granted' });
        }),
    );
    let result: unknown;
    void createNativeSpeech(fake.plugins)
      .listen({ timeoutMs: 1000 })
      .then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(5000);
    expect(result).toBeUndefined();
    slow();
    await vi.advanceTimersByTimeAsync(999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual({ kind: 'silence' });
    expect(fake.recognition.stop).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('permiso negado: unavailable permanente y no se vuelve a preguntar', async () => {
    const fake = fakePlugins('prompt', 'denied');
    const speech = createNativeSpeech(fake.plugins);
    expect(speech.capabilities().canListen).toBe(true);
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'not-allowed' });
    expect(speech.capabilities().canListen).toBe(false);
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'not-allowed' });
    expect(fake.recognition.requestPermissions).toHaveBeenCalledTimes(1);
    expect(fake.recognition.start).not.toHaveBeenCalled();
  });

  it('permiso concedido: se pregunta una sola vez en toda la sesión', async () => {
    vi.useFakeTimers();
    const fake = fakePlugins('prompt', 'granted');
    const speech = createNativeSpeech(fake.plugins);
    for (let i = 0; i < 2; i++) {
      const pending = speech.listen();
      await flush();
      fake.heard(['hi']);
      await pending;
    }
    expect(fake.recognition.requestPermissions).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('sin servicio de reconocimiento: unavailable permanente', async () => {
    vi.useFakeTimers();
    const fake = fakePlugins();
    const speech = createNativeSpeech(fake.plugins);
    const pending = speech.listen();
    await flush();
    fake.fail({ code: 'UNAVAILABLE', message: 'Speech recognition service is not available.' });
    expect(await pending).toEqual({ kind: 'unavailable', reason: 'unsupported' });
    expect(speech.capabilities().canListen).toBe(false);
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'unsupported' });
    expect(fake.recognition.start).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('un fallo pasajero no apaga la escucha', async () => {
    vi.useFakeTimers();
    const fake = fakePlugins();
    const speech = createNativeSpeech(fake.plugins);
    const pending = speech.listen();
    await flush();
    fake.fail({ message: 'RecognitionService busy' });
    expect(await pending).toEqual({ kind: 'unavailable', reason: 'error' });
    expect(speech.capabilities().canListen).toBe(true);
    vi.useRealTimers();
  });

  it('el estado es de la instancia', async () => {
    const a = createNativeSpeech(fakePlugins('prompt', 'denied').plugins);
    await a.listen();
    expect(createNativeSpeech(fakePlugins().plugins).capabilities().canListen).toBe(true);
  });

  it('cancelar durante la petición de permiso resuelve silence sin arrancar', async () => {
    vi.useFakeTimers();
    const fake = fakePlugins();
    const speech = createNativeSpeech(fake.plugins);
    const pending = speech.listen();
    speech.cancel();
    expect(await pending).toEqual({ kind: 'silence' });
    await flush();
    expect(fake.recognition.start).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  describe('síntesis', () => {
    it('habla en inglés con la velocidad y el tono pedidos y da true al terminar', async () => {
      const fake = fakePlugins();
      const speech = createNativeSpeech(fake.plugins);
      expect(await speech.speak('hello', { rate: 0.8, pitch: 1.2 })).toBe(true);
      expect(fake.tts.speak).toHaveBeenCalledWith({
        text: 'hello',
        lang: 'en-US',
        rate: 0.8,
        pitch: 1.2,
      });
    });

    it('un rechazo de la síntesis da false, sin lanzar', async () => {
      const fake = fakePlugins();
      fake.tts.speak.mockRejectedValue(new Error('ERROR_UNSUPPORTED_LANGUAGE'));
      const speech = createNativeSpeech(fake.plugins);
      expect(await speech.speak('hello')).toBe(false);
      expect(speech.capabilities().canSpeak).toBe(true);
    });
  });
});

describe('translateListenError', () => {
  it.each([
    [{ code: 'NO_MATCH' }, 'silence', false],
    [{ message: 'No speech input' }, 'silence', false],
    [{ message: 'Missing permission' }, 'not-allowed', true],
    [{ code: 'UNAVAILABLE', message: 'x' }, 'unsupported', true],
    [{ message: 'Audio recording error' }, 'no-microphone', true],
    [{ message: 'Network timeout' }, 'network', false],
    ['algo raro', 'error', false],
    [undefined, 'error', false],
  ])('%j', (error, expected, permanent) => {
    const { result, permanent: isPermanent } = translateListenError(error);
    expect(result.kind === 'silence' ? 'silence' : (result as { reason: string }).reason).toBe(
      expected,
    );
    expect(isPermanent).toBe(permanent);
  });
});
