import { createClient, type AuthError, type Session } from '@supabase/supabase-js';
import type {
  Account,
  Auth,
  AuthFailure,
  AuthResult,
  DeleteAccountResult,
} from '@linguapop/domain';

/** Lo que el adaptador usa de Supabase Auth; las pruebas lo reemplazan por uno falso. */
export type AuthClientLike = {
  getSession(): Promise<{ data: { session: Session | null } }>;
  onAuthStateChange(cb: (event: string, session: Session | null) => void): unknown;
  signUp(credentials: { email: string; password: string }): Promise<{
    data: { session: Session | null; user: { id: string; email?: string } | null };
    error: AuthError | null;
  }>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    data: { session: Session | null };
    error: AuthError | null;
  }>;
  signOut(): Promise<{ error: AuthError | null }>;
};

/** La función del servidor que borra la cuenta de la sesión; las pruebas la reemplazan por una falsa. */
export type DeleteAccountRpc = () => PromiseLike<{
  error: { message: string; status?: number } | null;
}>;

export type SupabaseConfig = { url?: string; anonKey?: string };

const toAccount = (session: Session | null): Account | null =>
  session ? { id: session.user.id, email: session.user.email ?? null } : null;

/** Traduce el error de Supabase Auth a un motivo del puerto, sin depender de su texto exacto. */
export function authFailure(error: Pick<AuthError, 'code' | 'message' | 'status'>): AuthFailure {
  const code = error.code ?? '';
  const text = error.message.toLowerCase();
  if (code === 'invalid_credentials' || /invalid login credentials/.test(text)) {
    return 'invalid-credentials';
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    /already registered/.test(text)
  ) {
    return 'email-taken';
  }
  if (code === 'weak_password' || /password should be|weak password/.test(text)) {
    return 'weak-password';
  }
  if (
    code === 'validation_failed' ||
    code === 'email_address_invalid' ||
    /invalid.*email/.test(text)
  ) {
    return 'invalid-email';
  }
  if (code === 'email_not_confirmed') return 'confirmation-required';
  if (/fetch|network/.test(text) || error.status === 0) return 'network';
  return 'error';
}

const failed = (reason: AuthFailure): AuthResult => ({ kind: 'failed', reason });

/** Sin servicio de cuentas: la app sigue como invitado y la interfaz no ofrece cuentas. */
export const unavailableAuth: Auth = {
  available: () => false,
  account: () => null,
  subscribe: () => () => undefined,
  signUp: async () => failed('error'),
  signIn: async () => failed('error'),
  signOut: async () => undefined,
  deleteAccount: async () => ({ kind: 'failed', reason: 'error' }),
};

/** Cuentas con Supabase Auth (AD-8). Solo recibe la URL y la clave anónima pública (AD-9). */
export function createSupabaseAuth(
  client: AuthClientLike,
  deleteAccountRpc: DeleteAccountRpc = async () => ({ error: { message: 'no disponible' } }),
): Auth {
  let current: Account | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Account | null) => {
    if (current?.id === next?.id && current?.email === next?.email) return;
    current = next;
    listeners.forEach((l) => l());
  };

  // La sesión guardada se restaura sola; después cada cambio llega por el aviso de Supabase.
  void client
    .getSession()
    .then(({ data }) => set(toAccount(data.session)))
    .catch(() => undefined);
  client.onAuthStateChange((_event, session) => set(toAccount(session)));

  async function finish(
    run: () => Promise<{ session: Session | null; error: AuthError | null }>,
  ): Promise<AuthResult> {
    try {
      const { session, error } = await run();
      if (error) return failed(authFailure(error));
      const account = toAccount(session);
      if (!account) return failed('confirmation-required');
      set(account);
      return { kind: 'ok', account };
    } catch {
      return failed('network');
    }
  }

  return {
    available: () => true,
    account: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    signUp: (email, password) =>
      finish(async () => {
        const { data, error } = await client.signUp({ email, password });
        return { session: data.session, error };
      }),
    signIn: (email, password) =>
      finish(async () => {
        const { data, error } = await client.signInWithPassword({ email, password });
        return { session: data.session, error };
      }),
    async signOut() {
      try {
        await client.signOut();
      } finally {
        set(null);
      }
    },
    async deleteAccount(): Promise<DeleteAccountResult> {
      if (!current) return { kind: 'failed', reason: 'error' };
      try {
        const { error } = await deleteAccountRpc();
        if (error) {
          return {
            kind: 'failed',
            reason: /fetch|network/i.test(error.message) ? 'network' : 'error',
          };
        }
      } catch {
        return { kind: 'failed', reason: 'network' };
      }
      // El usuario ya no existe: la sesión local no sirve y se cierra sin esperar al servidor.
      await client.signOut().catch(() => undefined);
      set(null);
      return { kind: 'ok' };
    },
  };
}

/** El adaptador real si hay URL y clave anónima; si no, sin cuentas. */
export function createAuthFromConfig({ url, anonKey }: SupabaseConfig): Auth {
  if (!url || !anonKey) return unavailableAuth;
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return createSupabaseAuth(client.auth as unknown as AuthClientLike, () =>
    client.rpc('delete_my_account'),
  );
}
