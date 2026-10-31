/** La cuenta con la sesión abierta. */
export type Account = { id: string; email: string | null };

export type AuthFailure =
  | 'invalid-credentials'
  | 'email-taken'
  | 'invalid-email'
  | 'weak-password'
  | 'confirmation-required'
  | 'network'
  | 'error';

export type AuthResult = { kind: 'ok'; account: Account } | { kind: 'failed'; reason: AuthFailure };

export type DeleteAccountResult = { kind: 'ok' } | { kind: 'failed'; reason: 'network' | 'error' };

/**
 * Sesión de la persona (AD-8). Sin sesión la app sigue como invitado con el progreso solo local;
 * si la plataforma no ofrece cuentas, `available()` es falso y la interfaz no las menciona.
 */
export interface Auth {
  /** Hay un servicio de cuentas configurado. */
  available(): boolean;
  /** La cuenta con sesión abierta, o `null` si es invitado. Cambia cuando termina `subscribe`. */
  account(): Account | null;
  /** Avisa cuando la sesión se abre, se cierra o se restaura; devuelve cómo dejar de escuchar. */
  subscribe(listener: () => void): () => void;
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Borra la cuenta con la sesión abierta y todo lo que tiene en el servidor, y cierra la sesión. */
  deleteAccount(): Promise<DeleteAccountResult>;
}
