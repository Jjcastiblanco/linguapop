import { describe, expect, it } from 'vitest';
import { createComposition } from '..';
import { createServices } from '../context';
import { memoria, nuevoId } from '../../test/helpers';
import type { AudioContextLike } from './web-sound';

describe('sonido y voz en la composición', () => {
  it('la composición ofrece voz y sonido, y la voz del navegador falta sin navegador', () => {
    const c = createComposition({ storage: memoria().storage, newId: nuevoId });
    expect(c.speech.capabilities()).toEqual({ canSpeak: false, canListen: false });
    expect(typeof c.sound.play).toBe('function');
  });

  it('el sonido obedece a la preferencia del dispositivo', async () => {
    let sonados = 0;
    const ctx = {
      currentTime: 0,
      state: 'running',
      destination: {},
      resume: () => undefined,
      createOscillator: () => ({
        type: '',
        frequency: { value: 0 },
        connect: () => undefined,
        start: () => undefined,
        stop: () => void sonados++,
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: () => undefined,
          linearRampToValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      }),
    } as unknown as AudioContextLike;
    const { createWebSound } = await import('./web-sound');
    const sound = createWebSound({ createContext: () => ctx });
    const services = createServices(
      createComposition({ storage: memoria().storage, newId: nuevoId, sound }),
    );
    services.composition.sound.play('click');
    expect(sonados).toBe(1);
    await services.ui.getState().setSound(false);
    services.composition.sound.play('click');
    expect(sonados).toBe(1);
    await services.ui.getState().setSound(true);
    services.composition.sound.play('click');
    expect(sonados).toBe(2);
  });
});
