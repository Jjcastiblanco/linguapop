import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Speech } from '@linguapop/domain';

/**
 * Lo que cada adaptador de voz sabe hacer a mano para que el contrato lo ejercite (AD-19).
 * Cada método actúa sobre la escucha en curso del adaptador.
 */
export type SpeechDriver = {
  /** El reconocimiento entendió algo: las alternativas van de la más probable a la menos. */
  emitHeard(alternatives: string[]): void;
  /** El reconocimiento terminó sin coincidencia. */
  emitNoMatch(): void;
  /** Se niega el permiso o falta el servicio: desde aquí no se puede escuchar. */
  denyPermission(): void;
};

/** Un adaptador listo para probar y el accionador que lo maneja. */
export type SpeechSetup = { speech: Speech; driver: SpeechDriver };

const TIMEOUT_MS = 3000;

/**
 * Pruebas de contrato del puerto `Speech` que todo adaptador debe pasar. Solo lo importan pruebas.
 * Corre con temporizadores falsos; `setup` se llama de nuevo en cada caso para tener estado limpio.
 */
export function runSpeechContract(name: string, setup: () => SpeechSetup): void {
  describe(`contrato de Speech: ${name}`, () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('heard: devuelve las alternativas en el orden recibido', async () => {
      const { speech, driver } = setup();
      const pending = speech.listen({ timeoutMs: TIMEOUT_MS });
      driver.emitHeard(['my name is ana', 'my name is anna']);
      expect(await pending).toEqual({
        kind: 'heard',
        alternatives: ['my name is ana', 'my name is anna'],
      });
    });

    it('silence: sin coincidencia da silencio', async () => {
      const { speech, driver } = setup();
      const pending = speech.listen({ timeoutMs: TIMEOUT_MS });
      driver.emitNoMatch();
      expect(await pending).toEqual({ kind: 'silence' });
    });

    it('silence: si pasa el tiempo sin hablar, el temporizador corta y da silencio', async () => {
      const { speech } = setup();
      let result: unknown;
      void speech.listen({ timeoutMs: TIMEOUT_MS }).then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toEqual({ kind: 'silence' });
    });

    it('unavailable: sin permiso o sin servicio no se puede escuchar', async () => {
      const { speech, driver } = setup();
      const pending = speech.listen({ timeoutMs: TIMEOUT_MS });
      driver.denyPermission();
      const result = await pending;
      expect(result.kind).toBe('unavailable');
      expect(speech.capabilities().canListen).toBe(false);
    });

    it('cancel: corta la escucha en curso y resuelve silence', async () => {
      const { speech } = setup();
      const pending = speech.listen({ timeoutMs: TIMEOUT_MS });
      speech.cancel();
      expect(await pending).toEqual({ kind: 'silence' });
    });

    it('cancel: sin nada en curso no lanza', () => {
      const { speech } = setup();
      expect(() => speech.cancel()).not.toThrow();
    });
  });
}
