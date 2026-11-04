// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Auth } from '@linguapop/domain';
import { createComposition } from '../composition';
import { memoria, nuevoId, relojFalso } from '../test/helpers';
import { createProgressStore } from './progress-store';
import { startProgressSync, SYNC_POLL_MS } from './progress-sync';

const ana: Account = { id: 'ana', email: 'ana@prueba.test' };

/** Una cuenta con sesión y un servidor que cuenta las veces que se le pregunta por eventos nuevos. */
async function arrancar(cuenta: Account | null = ana) {
  const auth: Auth = {
    available: () => true,
    account: () => cuenta,
    subscribe: () => () => undefined,
    signUp: async () => ({ kind: 'failed', reason: 'error' }),
    signIn: async () => ({ kind: 'failed', reason: 'error' }),
    signOut: async () => undefined,
    googleAvailable: () => false,
    signInWithGoogle: async () => ({ kind: 'failed', reason: 'error' }),
    deleteAccount: async () => ({ kind: 'ok' }),
  };
  const pulls = { n: 0 };
  const c = createComposition({
    storage: memoria().storage,
    timeZone: 'UTC',
    newId: nuevoId,
    clock: relojFalso(),
    auth,
    progressRemote: {
      available: () => true,
      push: async () => ({ accepted: [], rejected: [] }),
      pull: async () => {
        pulls.n++;
        return [];
      },
      rejected: async () => [],
    },
  });
  const progress = createProgressStore(c);
  await progress.getState().load();
  const stop = startProgressSync(c, progress);
  // Se descarta la pasada inicial que provoca la carga del progreso.
  await vi.advanceTimersByTimeAsync(5000);
  pulls.n = 0;
  return { pulls, stop };
}

const visibilidad = (estado: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true });

describe('cuándo sincroniza una pestaña abierta', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibilidad('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('al recuperar el foco de la ventana (cambio de ventana, sin ocultar la pestaña)', async () => {
    const { pulls, stop } = await arrancar();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(pulls.n).toBe(1);
    stop();
  });

  it('cada minuto mientras la pestaña está visible', async () => {
    const { pulls, stop } = await arrancar();
    await vi.advanceTimersByTimeAsync(SYNC_POLL_MS * 3);
    expect(pulls.n).toBe(3);
    stop();
  });

  it('con la pestaña oculta no pregunta al servidor', async () => {
    const { pulls, stop } = await arrancar();
    visibilidad('hidden');
    await vi.advanceTimersByTimeAsync(SYNC_POLL_MS * 3);
    expect(pulls.n).toBe(0);
    stop();
  });

  it('al detenerla ya no sondea ni escucha el foco', async () => {
    const { pulls, stop } = await arrancar();
    stop();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(SYNC_POLL_MS * 2);
    expect(pulls.n).toBe(0);
  });

  it('sin sesión no pregunta al servidor aunque se sondee', async () => {
    const { pulls, stop } = await arrancar(null);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(SYNC_POLL_MS * 2);
    expect(pulls.n).toBe(0);
    stop();
  });

  it('al volver a la pestaña sigue sincronizando', async () => {
    const { pulls, stop } = await arrancar();
    visibilidad('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibilidad('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(pulls.n).toBe(1);
    stop();
  });
});
