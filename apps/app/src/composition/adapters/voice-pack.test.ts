import { describe, expect, it, vi } from 'vitest';
import type { Speech } from '@linguapop/domain';
import {
  createVoicePack,
  nativeEnglishVoice,
  VOICE_PACK_KEY,
  VOICES_GRACE_MS,
  withVoicePack,
  type PackStorage,
  type TtsEngine,
} from './voice-pack';
import type { SpeechEnv } from './web-speech';

function storageFalso(
  inicial: Record<string, string> = {},
): PackStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(inicial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function motorFalso() {
  const motor = {
    load: vi.fn<TtsEngine['load']>(async (onProgress) => onProgress(0.5)),
    speak: vi.fn<TtsEngine['speak']>(async () => true),
    cancel: vi.fn<TtsEngine['cancel']>(),
  };
  return motor;
}

describe('voz de respaldo', () => {
  it('no descarga nada hasta que se pide', () => {
    const motor = motorFalso();
    const pack = createVoicePack(motor, 92, storageFalso());
    expect(pack.state()).toBe('idle');
    expect(motor.load).not.toHaveBeenCalled();
  });

  it('descargar pasa por downloading con avance y termina ready, y lo recuerda', async () => {
    const motor = motorFalso();
    const almacen = storageFalso();
    const pack = createVoicePack(motor, 92, almacen);
    const avisos = vi.fn();
    pack.subscribe(avisos);
    const hecho = pack.download();
    expect(pack.state()).toBe('downloading');
    expect(await hecho).toBe(true);
    expect(pack.state()).toBe('ready');
    expect(pack.progress()).toBe(1);
    expect(avisos).toHaveBeenCalled();
    expect(almacen.data.get(VOICE_PACK_KEY)).toBe('1');
  });

  it('dos pedidos seguidos comparten una sola descarga', async () => {
    const motor = motorFalso();
    const pack = createVoicePack(motor, 92, storageFalso());
    await Promise.all([pack.download(), pack.download()]);
    expect(motor.load).toHaveBeenCalledTimes(1);
  });

  it('si la descarga falla queda failed, sin recordarla, y se puede reintentar', async () => {
    const motor = motorFalso();
    motor.load.mockRejectedValueOnce(new Error('sin red'));
    const almacen = storageFalso();
    const pack = createVoicePack(motor, 92, almacen);
    expect(await pack.download()).toBe(false);
    expect(pack.state()).toBe('failed');
    expect(almacen.data.has(VOICE_PACK_KEY)).toBe(false);
    expect(await pack.download()).toBe(true);
    expect(pack.state()).toBe('ready');
  });

  it('si ya se descargó antes arranca ready y carga la copia sin preguntar', async () => {
    const motor = motorFalso();
    const pack = createVoicePack(motor, 92, storageFalso({ [VOICE_PACK_KEY]: '1' }));
    expect(pack.state()).toBe('ready');
    expect(await pack.speak('hello')).toBe(true);
    expect(motor.load).toHaveBeenCalledTimes(1);
    expect(motor.speak).toHaveBeenCalledWith('hello', undefined);
  });

  it('si la copia guardada ya no carga, olvida la marca y vuelve a ofrecerla', async () => {
    const motor = motorFalso();
    motor.load.mockRejectedValueOnce(new Error('caché borrada'));
    const almacen = storageFalso({ [VOICE_PACK_KEY]: '1' });
    const pack = createVoicePack(motor, 92, almacen);
    expect(await pack.speak('hello')).toBe(false);
    expect(pack.state()).toBe('idle');
    expect(almacen.data.has(VOICE_PACK_KEY)).toBe(false);
  });

  it('sin descargar no habla', async () => {
    const motor = motorFalso();
    const pack = createVoicePack(motor, 92, storageFalso());
    expect(await pack.speak('hello')).toBe(false);
    expect(motor.speak).not.toHaveBeenCalled();
  });

  it('un almacenamiento que lanza no rompe nada', async () => {
    const roto: PackStorage = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    const pack = createVoicePack(motorFalso(), 92, roto);
    expect(pack.state()).toBe('idle');
    expect(await pack.download()).toBe(true);
  });
});

describe('voz del navegador con respaldo', () => {
  const voz = (lang: string) => ({ name: 'v', lang });
  const entorno = (voices: { name: string; lang: string }[]): SpeechEnv => ({
    synth: { getVoices: () => voices, speak: vi.fn(), cancel: vi.fn() },
    createUtterance: () => {
      throw new Error('no se usa');
    },
  });

  it('con voz en inglés usa la del sistema', () => {
    expect(nativeEnglishVoice(entorno([voz('en-US')]), 0, () => 10_000)).toBe(true);
  });

  it('con voces solo en otros idiomas no hay voz en inglés', () => {
    expect(nativeEnglishVoice(entorno([voz('es-ES')]), 0, () => 0)).toBe(false);
  });

  it('una lista vacía cuenta como «aún no se sabe» y luego como sin voz', () => {
    const env = entorno([]);
    expect(nativeEnglishVoice(env, 0, () => VOICES_GRACE_MS - 1)).toBe(true);
    expect(nativeEnglishVoice(env, 0, () => VOICES_GRACE_MS)).toBe(false);
  });

  it('sin síntesis no hay voz', () => {
    expect(nativeEnglishVoice({}, 0, () => 0)).toBe(false);
  });

  function baseFalsa(canSpeak: boolean) {
    const base: Speech = {
      capabilities: () => ({ canSpeak, canListen: true }),
      speak: vi.fn(async () => true),
      listen: vi.fn(async () => ({ kind: 'silence' as const })),
      cancel: vi.fn(),
    };
    return base;
  }

  it('con voz del sistema no toca la de respaldo', async () => {
    const motor = motorFalso();
    const pack = createVoicePack(motor, 92, storageFalso());
    const base = baseFalsa(true);
    const speech = withVoicePack(base, pack, () => true);
    expect(speech.capabilities()).toEqual({ canSpeak: true, canListen: true });
    expect(await speech.speak('hi')).toBe(true);
    expect(base.speak).toHaveBeenCalled();
    expect(motor.speak).not.toHaveBeenCalled();
  });

  it('sin voz en inglés ni descarga, no puede hablar y ofrece la descarga', async () => {
    const pack = createVoicePack(motorFalso(), 92, storageFalso());
    const speech = withVoicePack(baseFalsa(true), pack, () => false);
    expect(speech.capabilities().canSpeak).toBe(false);
    expect(await speech.speak('hi')).toBe(false);
    expect(speech.voicePack).toBe(pack);
  });

  it('tras descargar habla con la de respaldo y escuchar sigue siendo del navegador', async () => {
    const motor = motorFalso();
    const pack = createVoicePack(motor, 92, storageFalso());
    const base = baseFalsa(false);
    const speech = withVoicePack(base, pack, () => false);
    await pack.download();
    expect(speech.capabilities().canSpeak).toBe(true);
    expect(await speech.speak('hi', { rate: 0.5 })).toBe(true);
    expect(motor.speak).toHaveBeenCalledWith('hi', { rate: 0.5 });
    await speech.listen();
    expect(base.listen).toHaveBeenCalled();
  });

  it('cancel corta las dos voces', () => {
    const motor = motorFalso();
    const base = baseFalsa(true);
    const speech = withVoicePack(base, createVoicePack(motor, 92, storageFalso()), () => true);
    speech.cancel();
    expect(base.cancel).toHaveBeenCalled();
    expect(motor.cancel).toHaveBeenCalled();
  });
});
