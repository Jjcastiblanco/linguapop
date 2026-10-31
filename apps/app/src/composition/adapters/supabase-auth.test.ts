import type { AuthError, Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  authFailure,
  createAuthFromConfig,
  createSupabaseAuth,
  unavailableAuth,
  type AuthClientLike,
  type NativeGoogleCredential,
} from './supabase-auth';

const sesion = (id = 'u1', email = 'ana@prueba.test') => ({ user: { id, email } }) as Session;
const error = (code: string, message = code, status = 400) =>
  ({ code, message, status }) as AuthError;

/** Un Supabase Auth falso: guarda la sesión y avisa los cambios como el real. */
function clienteFalso(inicial: Session | null = null) {
  let actual = inicial;
  let aviso: (event: string, s: Session | null) => void = () => undefined;
  const client = {
    getSession: vi.fn(async () => ({ data: { session: actual } })),
    onAuthStateChange: vi.fn((cb: typeof aviso) => void (aviso = cb)),
    signUp: vi.fn<AuthClientLike['signUp']>(async () => ({
      data: { session: sesion(), user: { id: 'u1' } },
      error: null,
    })),
    signInWithPassword: vi.fn<AuthClientLike['signInWithPassword']>(async () => ({
      data: { session: sesion() },
      error: null,
    })),
    signOut: vi.fn<AuthClientLike['signOut']>(async () => ({ error: null })),
    signInWithOAuth: vi.fn<AuthClientLike['signInWithOAuth']>(async () => ({ error: null })),
    signInWithIdToken: vi.fn<AuthClientLike['signInWithIdToken']>(async () => ({
      data: { session: sesion() },
      error: null,
    })),
  };
  return {
    client: client as unknown as AuthClientLike,
    mock: client,
    avisar: (s: Session | null) => {
      actual = s;
      aviso('SIGNED_IN', s);
    },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('traducción de errores de Supabase Auth', () => {
  it.each([
    [error('invalid_credentials', 'Invalid login credentials'), 'invalid-credentials'],
    [error('user_already_exists', 'User already registered'), 'email-taken'],
    [error('weak_password', 'Password should be at least 6 characters'), 'weak-password'],
    [error('email_address_invalid', 'Email address is invalid'), 'invalid-email'],
    [error('email_not_confirmed', 'Email not confirmed'), 'confirmation-required'],
    [error('unexpected_failure', 'Failed to fetch', 0), 'network'],
    [error('over_request_rate_limit', 'Too many', 429), 'error'],
  ])('%j', (e, motivo) => expect(authFailure(e)).toBe(motivo));
});

describe('cuentas con Supabase Auth', () => {
  it('sin sesión es invitado y avisa al restaurar una sesión guardada', async () => {
    const { client } = clienteFalso(sesion('u7', 'luis@prueba.test'));
    const auth = createSupabaseAuth(client);
    const oyente = vi.fn();
    auth.subscribe(oyente);
    expect(auth.available()).toBe(true);
    expect(auth.account()).toBeNull();
    await flush();
    expect(auth.account()).toEqual({ id: 'u7', email: 'luis@prueba.test' });
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('crear cuenta e iniciar sesión dejan la cuenta abierta y avisan una vez', async () => {
    const { client, mock } = clienteFalso();
    const auth = createSupabaseAuth(client);
    const oyente = vi.fn();
    auth.subscribe(oyente);
    const r = await auth.signUp('ana@prueba.test', 'secreto1');
    expect(r).toEqual({ kind: 'ok', account: { id: 'u1', email: 'ana@prueba.test' } });
    expect(mock.signUp).toHaveBeenCalledWith({ email: 'ana@prueba.test', password: 'secreto1' });
    expect(auth.account()?.id).toBe('u1');
    await auth.signIn('ana@prueba.test', 'secreto1');
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('un error de credenciales no abre sesión y dice el motivo', async () => {
    const { client, mock } = clienteFalso();
    mock.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: error('invalid_credentials', 'Invalid login credentials'),
    });
    const auth = createSupabaseAuth(client);
    expect(await auth.signIn('a@b.test', 'mala')).toEqual({
      kind: 'failed',
      reason: 'invalid-credentials',
    });
    expect(auth.account()).toBeNull();
  });

  it('si crear la cuenta no devuelve sesión, pide confirmar el correo', async () => {
    const { client, mock } = clienteFalso();
    mock.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u2' } }, error: null });
    const auth = createSupabaseAuth(client);
    expect(await auth.signUp('a@b.test', 'secreto1')).toEqual({
      kind: 'failed',
      reason: 'confirmation-required',
    });
    expect(auth.account()).toBeNull();
  });

  it('una excepción de red da network y no deja la cuenta a medias', async () => {
    const { client, mock } = clienteFalso();
    mock.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'));
    const auth = createSupabaseAuth(client);
    expect(await auth.signIn('a@b.test', 'secreto1')).toEqual({
      kind: 'failed',
      reason: 'network',
    });
    expect(auth.account()).toBeNull();
  });

  it('cerrar sesión deja al invitado, aunque el servidor falle', async () => {
    const { client, mock } = clienteFalso();
    const auth = createSupabaseAuth(client);
    await auth.signIn('ana@prueba.test', 'secreto1');
    mock.signOut.mockRejectedValue(new Error('sin red'));
    await auth.signOut().catch(() => undefined);
    expect(auth.account()).toBeNull();
  });

  it('un cambio de sesión que llega desde Supabase se refleja y se puede dejar de escuchar', async () => {
    const { client, avisar } = clienteFalso();
    const auth = createSupabaseAuth(client);
    const oyente = vi.fn();
    const dejar = auth.subscribe(oyente);
    avisar(sesion('u9', 'otra@prueba.test'));
    expect(auth.account()).toEqual({ id: 'u9', email: 'otra@prueba.test' });
    dejar();
    avisar(null);
    expect(oyente).toHaveBeenCalledTimes(1);
  });
});

describe('entrar con Google', () => {
  const google = { redirectTo: () => 'https://app.test/perfil' };

  it('sin la opción no está disponible y no llama al servidor', async () => {
    const { client, mock } = clienteFalso();
    const auth = createSupabaseAuth(client);
    expect(auth.googleAvailable()).toBe(false);
    expect(await auth.signInWithGoogle()).toEqual({ kind: 'failed', reason: 'error' });
    expect(mock.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('redirige a Google y vuelve a la dirección indicada', async () => {
    const { client, mock } = clienteFalso();
    const auth = createSupabaseAuth(client, undefined, google);
    expect(auth.googleAvailable()).toBe(true);
    expect(await auth.signInWithGoogle()).toEqual({ kind: 'redirecting' });
    expect(mock.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.test/perfil' },
    });
  });

  it('un error de red o del servidor se explica', async () => {
    const { client, mock } = clienteFalso();
    const auth = createSupabaseAuth(client, undefined, google);
    mock.signInWithOAuth.mockResolvedValueOnce({
      error: error('unexpected_failure', 'fetch failed', 0),
    });
    expect(await auth.signInWithGoogle()).toEqual({ kind: 'failed', reason: 'network' });
    mock.signInWithOAuth.mockResolvedValueOnce({ error: error('unexpected_failure', 'boom', 500) });
    expect(await auth.signInWithGoogle()).toEqual({ kind: 'failed', reason: 'error' });
    mock.signInWithOAuth.mockRejectedValueOnce(new Error('caído'));
    expect(await auth.signInWithGoogle()).toEqual({ kind: 'failed', reason: 'network' });
  });
});

describe('entrar con Google con el selector nativo', () => {
  const credencial = { kind: 'ok', idToken: 'token-de-google', nonce: 'nonce-crudo' } as const;
  const nativo = (resultado: Awaited<ReturnType<NonNullable<NativeOption['native']>>>) => ({
    native: vi.fn(async () => resultado),
  });
  type NativeOption = { native: () => Promise<NativeGoogleCredential> };

  it('entrega a Supabase el token y el nonce crudo y deja la sesión abierta', async () => {
    const { client, mock } = clienteFalso();
    const opcion = nativo(credencial);
    const auth = createSupabaseAuth(client, undefined, opcion);
    expect(auth.googleAvailable()).toBe(true);
    expect(await auth.signInWithGoogle()).toEqual({
      kind: 'ok',
      account: { id: 'u1', email: 'ana@prueba.test' },
    });
    expect(mock.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'token-de-google',
      nonce: 'nonce-crudo',
    });
    expect(mock.signInWithOAuth).not.toHaveBeenCalled();
    expect(auth.account()).toEqual({ id: 'u1', email: 'ana@prueba.test' });
  });

  it('una cancelación o un fallo del selector no llega a Supabase', async () => {
    const { client, mock } = clienteFalso();
    const cancelado = createSupabaseAuth(client, undefined, nativo({ kind: 'cancelled' }));
    expect(await cancelado.signInWithGoogle()).toEqual({ kind: 'cancelled' });
    const sinRed = createSupabaseAuth(
      client,
      undefined,
      nativo({ kind: 'failed', reason: 'network' }),
    );
    expect(await sinRed.signInWithGoogle()).toEqual({ kind: 'failed', reason: 'network' });
    expect(mock.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('un error de Supabase se explica y no abre sesión', async () => {
    const { client, mock } = clienteFalso();
    const auth = createSupabaseAuth(client, undefined, nativo(credencial));
    mock.signInWithIdToken.mockResolvedValueOnce({
      data: { session: null },
      error: error('bad_jwt', 'nonce mismatch', 400),
    });
    expect(await auth.signInWithGoogle()).toEqual({ kind: 'failed', reason: 'error' });
    mock.signInWithIdToken.mockRejectedValueOnce(new Error('caído'));
    expect(await auth.signInWithGoogle()).toEqual({ kind: 'failed', reason: 'network' });
    expect(auth.account()).toBeNull();
  });
});

describe('borrar la cuenta', () => {
  it('llama a la función del servidor, cierra la sesión y avisa', async () => {
    const { client, mock } = clienteFalso();
    const rpc = vi.fn(async () => ({ error: null }));
    const auth = createSupabaseAuth(client, rpc);
    await auth.signIn('ana@prueba.test', 'secreto1');
    const oyente = vi.fn();
    auth.subscribe(oyente);
    expect(await auth.deleteAccount()).toEqual({ kind: 'ok' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mock.signOut).toHaveBeenCalled();
    expect(auth.account()).toBeNull();
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sin red', { message: 'TypeError: Failed to fetch' }, 'network'],
    ['un fallo del servidor', { message: 'se necesita una sesión abierta' }, 'error'],
  ] as const)(
    'si falla (%s) mantiene la sesión y explica el motivo',
    async (_caso, error, reason) => {
      const { client, mock } = clienteFalso();
      const auth = createSupabaseAuth(client, async () => ({ error }));
      await auth.signIn('ana@prueba.test', 'secreto1');
      expect(await auth.deleteAccount()).toEqual({ kind: 'failed', reason });
      expect(auth.account()).not.toBeNull();
      expect(mock.signOut).not.toHaveBeenCalled();
    },
  );

  it('una excepción de red también es un fallo y sin sesión no llama al servidor', async () => {
    const { client } = clienteFalso();
    const rpc = vi.fn(async () => {
      throw new Error('caído');
    });
    const auth = createSupabaseAuth(client, rpc);
    expect(await auth.deleteAccount()).toEqual({ kind: 'failed', reason: 'error' });
    expect(rpc).not.toHaveBeenCalled();
    await auth.signIn('ana@prueba.test', 'secreto1');
    expect(await auth.deleteAccount()).toEqual({ kind: 'failed', reason: 'network' });
    expect(auth.account()).not.toBeNull();
  });
});

describe('sin servicio de cuentas', () => {
  it('sin URL o sin clave anónima no hay cuentas y la app sigue de invitado', async () => {
    expect(createAuthFromConfig({})).toBe(unavailableAuth);
    expect(createAuthFromConfig({ url: 'https://x.supabase.co' })).toBe(unavailableAuth);
    expect(unavailableAuth.available()).toBe(false);
    expect(unavailableAuth.account()).toBeNull();
    expect(await unavailableAuth.signIn('a', 'b')).toEqual({ kind: 'failed', reason: 'error' });
  });
});
