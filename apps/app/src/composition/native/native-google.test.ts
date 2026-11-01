import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createNativeGoogle, type SocialLoginPlugin } from './native-google';

const respuesta = (idToken: string | null = 'token-de-google') => ({
  provider: 'google',
  result: { responseType: 'online', accessToken: null, idToken, profile: {} },
});

function pluginFalso() {
  const mock = {
    initialize: vi.fn<(options: unknown) => Promise<void>>(async () => undefined),
    login: vi.fn<(options: unknown) => Promise<unknown>>(async () => respuesta()),
  };
  return { plugin: mock as unknown as SocialLoginPlugin, mock };
}

describe('selector nativo de Google', () => {
  it('manda a Google el hash del nonce y devuelve el nonce crudo con el token', async () => {
    const { plugin, mock } = pluginFalso();
    const result = await createNativeGoogle('web-id', plugin, () => true)();
    expect(result).toMatchObject({ kind: 'ok', idToken: 'token-de-google' });
    if (result.kind !== 'ok') return;
    const enviado = mock.login.mock.calls[0]![0] as {
      options: { nonce: string; scopes?: unknown };
    };
    expect(result.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(enviado.options.nonce).toBe(createHash('sha256').update(result.nonce).digest('hex'));
    expect(enviado.options.nonce).not.toBe(result.nonce);
    // Sin scopes: pedirlos exigiría modificar MainActivity.
    expect(enviado.options.scopes).toBeUndefined();
    expect(enviado.options).toMatchObject({ style: 'bottom', forcePrompt: true });
  });

  it('inicializa con el ID del cliente web, una sola vez, y cada entrada usa un nonce nuevo', async () => {
    const { plugin, mock } = pluginFalso();
    const entrar = createNativeGoogle('web-id', plugin, () => true);
    const a = await entrar();
    const b = await entrar();
    expect(mock.initialize).toHaveBeenCalledTimes(1);
    expect(mock.initialize).toHaveBeenCalledWith({
      google: { webClientId: 'web-id', mode: 'online' },
    });
    expect(a).not.toEqual(b);
  });

  it('si falló al inicializar lo reintenta en la siguiente entrada', async () => {
    const { plugin, mock } = pluginFalso();
    mock.initialize.mockRejectedValueOnce(new Error('fallo'));
    const entrar = createNativeGoogle('web-id', plugin, () => true);
    expect(await entrar()).toEqual({ kind: 'failed', reason: 'error' });
    expect(await entrar()).toMatchObject({ kind: 'ok' });
    expect(mock.initialize).toHaveBeenCalledTimes(2);
  });

  it('sin red lo dice sin abrir el selector', async () => {
    const { plugin, mock } = pluginFalso();
    expect(await createNativeGoogle('web-id', plugin, () => false)()).toEqual({
      kind: 'failed',
      reason: 'network',
    });
    expect(mock.login).not.toHaveBeenCalled();
  });

  it('cerrar el selector es una cancelación, no un error', async () => {
    const { plugin, mock } = pluginFalso();
    mock.login.mockRejectedValueOnce({
      code: 'USER_CANCELLED',
      message: 'Google Sign-In cancelled by user',
    });
    expect(await createNativeGoogle('web-id', plugin, () => true)()).toEqual({
      kind: 'cancelled',
    });
  });

  it('un cancelado sin el código del plugin es un error visible, no silencio', async () => {
    const { plugin, mock } = pluginFalso();
    mock.login.mockRejectedValueOnce(
      new Error('Google Sign-In failed: activity is cancelled by the user.'),
    );
    expect(await createNativeGoogle('web-id', plugin, () => true)()).toEqual({
      kind: 'failed',
      reason: 'error',
    });
  });

  it('los otros fallos se traducen y una respuesta sin token es un error', async () => {
    const { plugin, mock } = pluginFalso();
    const entrar = createNativeGoogle('web-id', plugin, () => true);
    mock.login.mockRejectedValueOnce(new Error('Network error'));
    expect(await entrar()).toEqual({ kind: 'failed', reason: 'network' });
    mock.login.mockRejectedValueOnce(new Error('28444 Developer console is not set up correctly'));
    expect(await entrar()).toEqual({ kind: 'failed', reason: 'error' });
    mock.login.mockResolvedValueOnce(respuesta(null));
    expect(await entrar()).toEqual({ kind: 'failed', reason: 'error' });
  });
});
