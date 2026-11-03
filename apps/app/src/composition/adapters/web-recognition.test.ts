// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ListenResult, Speech } from '@linguapop/domain';
import { RECOGNITION_KEY, withWhisperRecognition, type Recorder } from './web-recognition';
import type { WhisperEngine } from './whisper-engine';

function baseFalsa(canListen: boolean, result: ListenResult = { kind: 'silence' }) {
  let puede = canListen;
  const base: Speech = {
    capabilities: () => ({ canSpeak: true, canListen: puede }),
    speak: vi.fn(async () => true),
    listen: vi.fn(async () => {
      if (result.kind === 'unavailable') puede = false;
      return result;
    }),
    cancel: vi.fn(),
  };
  return base;
}

function motorFalso(texto = ' The soup is delicious.') {
  return {
    load: vi.fn(async (onProgress: (f: number) => void) => onProgress(1)),
    transcribe: vi.fn(async () => texto),
  } satisfies WhisperEngine;
}

const audio = { kind: 'audio' as const, samples: new Float32Array(16_000) };

function preparar(base: Speech, motor = motorFalso(), record: Recorder = async () => audio) {
  window.localStorage.clear();
  const speech = withWhisperRecognition(base, { engine: motor, record });
  return { speech, motor, record: vi.fn(record) };
}

describe('reconocimiento de respaldo', () => {
  it('ofrece el modelo sin descargarlo y no cambia lo que ya puede el navegador', () => {
    const { speech, motor } = preparar(baseFalsa(true));
    expect(speech.recognitionPack?.state()).toBe('idle');
    expect(speech.recognitionPack?.sizeMb).toBe(40);
    expect(speech.capabilities()).toEqual({ canSpeak: true, canListen: true });
    expect(motor.load).not.toHaveBeenCalled();
  });

  it('si el navegador puede escuchar, lo usa y no toca el modelo', async () => {
    const heard: ListenResult = { kind: 'heard', alternatives: ['hello'] };
    const base = baseFalsa(true, heard);
    const { speech, motor } = preparar(base);
    await speech.recognitionPack?.download();
    expect(await speech.listen()).toEqual(heard);
    expect(motor.transcribe).not.toHaveBeenCalled();
  });

  it('sin reconocimiento propio y sin modelo, da por no disponible', async () => {
    const base = baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' });
    const { speech } = preparar(base);
    expect(speech.capabilities().canListen).toBe(false);
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'unsupported' });
  });

  it('con el modelo descargado puede escuchar aunque el navegador no', async () => {
    const { speech } = preparar(baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' }));
    await speech.recognitionPack?.download();
    expect(speech.capabilities().canListen).toBe(true);
  });

  it('con el modelo graba, transcribe y devuelve lo entendido limpio', async () => {
    const base = baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' });
    const { speech, motor } = preparar(base, motorFalso(' [BLANK_AUDIO] The soup is delicious.'));
    await speech.recognitionPack?.download();
    expect(await speech.listen({ timeoutMs: 5000 })).toEqual({
      kind: 'heard',
      alternatives: ['The soup is delicious.'],
    });
    expect(base.listen).not.toHaveBeenCalled();
    expect(motor.transcribe).toHaveBeenCalledTimes(1);
  });

  it('si el servicio del navegador falla de forma definitiva (Brave), prueba con el modelo', async () => {
    const base = baseFalsa(true, { kind: 'unavailable', reason: 'network' });
    const { speech, motor } = preparar(base);
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'network' });
    await speech.recognitionPack?.download();
    expect(speech.capabilities().canListen).toBe(true);
    expect(await speech.listen()).toMatchObject({ kind: 'heard' });
    expect(motor.transcribe).toHaveBeenCalled();
  });

  it('un permiso de micrófono denegado en el navegador no se prueba con el modelo', async () => {
    const base = baseFalsa(true, { kind: 'unavailable', reason: 'not-allowed' });
    const { speech, motor } = preparar(base);
    await speech.recognitionPack?.download();
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'not-allowed' });
    expect(motor.transcribe).not.toHaveBeenCalled();
  });

  it('si no habló nadie no transcribe y da silencio', async () => {
    const base = baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' });
    const { speech, motor } = preparar(base, motorFalso(), async () => ({ kind: 'silence' }));
    await speech.recognitionPack?.download();
    expect(await speech.listen()).toEqual({ kind: 'silence' });
    expect(motor.transcribe).not.toHaveBeenCalled();
  });

  it('un texto que solo es una marca de ruido se toma como silencio', async () => {
    const base = baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' });
    const { speech } = preparar(base, motorFalso(' [BLANK_AUDIO]'));
    await speech.recognitionPack?.download();
    expect(await speech.listen()).toEqual({ kind: 'silence' });
  });

  it('el permiso o el micrófono se reportan tal cual', async () => {
    const base = baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' });
    const { speech } = preparar(base, motorFalso(), async () => ({
      kind: 'unavailable',
      reason: 'not-allowed',
    }));
    await speech.recognitionPack?.download();
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'not-allowed' });
  });

  it('si el reconocimiento falla guarda el motivo y da error', async () => {
    const motor = motorFalso();
    motor.transcribe.mockRejectedValueOnce(new Error('el reconocimiento sin respuesta tras 60 s'));
    const base = baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' });
    const { speech } = preparar(base, motor);
    await speech.recognitionPack?.download();
    expect(await speech.listen()).toEqual({ kind: 'unavailable', reason: 'error' });
    expect(speech.recognitionPack?.error()).toContain('sin respuesta');
  });

  it('cancelar corta la grabación en curso y da silencio', async () => {
    let abortar: () => void = () => undefined;
    const record: Recorder = ({ signal }) =>
      new Promise((resolve) => {
        abortar = () => resolve({ kind: 'silence' });
        signal.addEventListener('abort', abortar);
      });
    const base = baseFalsa(false, { kind: 'unavailable', reason: 'unsupported' });
    const { speech } = preparar(base, motorFalso(), record);
    await speech.recognitionPack?.download();
    const pendiente = speech.listen();
    speech.cancel();
    expect(await pendiente).toEqual({ kind: 'silence' });
    expect(base.cancel).toHaveBeenCalled();
  });

  it('el modelo ya descargado en otra visita deja escuchar desde el inicio', () => {
    window.localStorage.setItem(RECOGNITION_KEY, '1');
    const speech = withWhisperRecognition(baseFalsa(false), {
      engine: motorFalso(),
      record: async () => audio,
    });
    expect(speech.recognitionPack?.state()).toBe('ready');
    expect(speech.capabilities().canListen).toBe(true);
  });
});
