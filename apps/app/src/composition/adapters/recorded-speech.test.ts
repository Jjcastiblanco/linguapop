import { describe, expect, it, vi } from 'vitest';
import { audioKey } from '@linguapop/content';
import type { Speech } from '@linguapop/domain';
import { withRecordings, type ClipPlayer, type RecordingsEnv } from './recorded-speech';

function baseFalsa(canSpeak = true) {
  const base: Speech = {
    capabilities: () => ({ canSpeak, canListen: true }),
    speak: vi.fn(async () => true),
    listen: vi.fn(async () => ({ kind: 'silence' as const })),
    cancel: vi.fn(),
  };
  return base;
}

function entornoFalso(claves: string[] | Error) {
  const player = {
    play: vi.fn<ClipPlayer['play']>(async () => 'ended'),
    stop: vi.fn<ClipPlayer['stop']>(),
  };
  const env: RecordingsEnv = {
    baseUrl: '/audio/',
    loadManifest: () =>
      claves instanceof Error ? Promise.reject(claves) : Promise.resolve(claves),
    player,
  };
  return { env, player };
}

describe('voz pregrabada', () => {
  it('con grabación la reproduce y no usa la voz de respaldo', async () => {
    const { env, player } = entornoFalso([audioKey('Hello')]);
    const base = baseFalsa();
    const speech = withRecordings(base, env);
    expect(await speech.speak('Hello')).toBe(true);
    expect(player.play).toHaveBeenCalledWith(`/audio/${audioKey('Hello')}.mp3`, 1);
    expect(base.speak).not.toHaveBeenCalled();
  });

  it('ignora espacios sobrantes al buscar la grabación', async () => {
    const { env, player } = entornoFalso([audioKey('Good morning')]);
    const speech = withRecordings(baseFalsa(), env);
    await speech.speak('  Good   morning ');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('despacio usa la grabación lenta sin estirarla', async () => {
    const { env, player } = entornoFalso([audioKey('Hello', 'slow'), audioKey('Hello')]);
    await withRecordings(baseFalsa(), env).speak('Hello', { rate: 0.55 });
    expect(player.play).toHaveBeenCalledWith(`/audio/${audioKey('Hello', 'slow')}.mp3`, 1);
  });

  it('una palabra sin versión lenta estira la normal', async () => {
    const { env, player } = entornoFalso([audioKey('Hello')]);
    await withRecordings(baseFalsa(), env).speak('Hello', { rate: 0.55 });
    expect(player.play).toHaveBeenCalledWith(`/audio/${audioKey('Hello')}.mp3`, 0.55);
  });

  it('velocidades intermedias ajustan la reproducción de la grabación normal', async () => {
    const { env, player } = entornoFalso([audioKey('Hello')]);
    const speech = withRecordings(baseFalsa(), env);
    await speech.speak('Hello', { rate: 0.8 });
    await speech.speak('Hello', { rate: 1.1 });
    expect(player.play).toHaveBeenNthCalledWith(1, expect.any(String), 0.8);
    expect(player.play).toHaveBeenNthCalledWith(2, expect.any(String), 1.1);
  });

  it('sin grabación para el texto lo dice la voz de respaldo', async () => {
    const { env, player } = entornoFalso([audioKey('Hello')]);
    const base = baseFalsa();
    expect(await withRecordings(base, env).speak('Something new', { rate: 1 })).toBe(true);
    expect(player.play).not.toHaveBeenCalled();
    expect(base.speak).toHaveBeenCalledWith('Something new', { rate: 1 });
  });

  it('si el archivo no se puede reproducir cae a la voz de respaldo', async () => {
    const { env, player } = entornoFalso([audioKey('Hello')]);
    player.play.mockRejectedValueOnce(new Error('404'));
    const base = baseFalsa();
    expect(await withRecordings(base, env).speak('Hello')).toBe(true);
    expect(base.speak).toHaveBeenCalledWith('Hello', {});
  });

  it('cortar la grabación no la reemplaza por la voz de respaldo', async () => {
    const { env, player } = entornoFalso([audioKey('Hello')]);
    player.play.mockResolvedValueOnce('stopped');
    const base = baseFalsa();
    expect(await withRecordings(base, env).speak('Hello')).toBe(false);
    expect(base.speak).not.toHaveBeenCalled();
  });

  it('sin manifiesto todo lo dice la voz de respaldo y puede hablar según ella', async () => {
    const { env } = entornoFalso(new Error('sin red'));
    const mudo = withRecordings(baseFalsa(false), env);
    expect(await mudo.speak('Hello')).toBe(true); // la voz de respaldo (falsa) responde
    expect(mudo.capabilities().canSpeak).toBe(false);
    const habla = withRecordings(baseFalsa(true), env);
    await habla.speak('Hello');
    expect(habla.capabilities().canSpeak).toBe(true);
  });

  it('con grabaciones puede hablar aunque el navegador no tenga voz', async () => {
    const { env } = entornoFalso([audioKey('Hello')]);
    const speech = withRecordings(baseFalsa(false), env);
    await speech.speak('Hello');
    expect(speech.capabilities().canSpeak).toBe(true);
  });

  it('escuchar es de la voz de respaldo y cancelar corta las dos', async () => {
    const { env, player } = entornoFalso([]);
    const base = baseFalsa();
    const speech = withRecordings(base, env);
    expect(speech.capabilities().canListen).toBe(true);
    await speech.listen({ timeoutMs: 100 });
    expect(base.listen).toHaveBeenCalledWith({ timeoutMs: 100 });
    speech.cancel();
    expect(player.stop).toHaveBeenCalled();
    expect(base.cancel).toHaveBeenCalled();
  });
});
