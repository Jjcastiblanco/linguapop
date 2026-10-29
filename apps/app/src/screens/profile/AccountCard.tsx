import { useState, type FormEvent } from 'react';
import { useAccount, useServices } from '../../composition/context';
import { t, type TextKey } from '../../i18n';
import { Modal } from '../../ui/Modal';
import styles from './ProfileScreen.module.css';

type Mode = 'signUp' | 'signIn';

/**
 * Cuenta de la persona (5.2): crear cuenta, iniciar y cerrar sesión con correo y contraseña. Sin
 * sesión la app sigue como invitado; no se muestra si la plataforma no tiene servicio de cuentas.
 */
export function AccountCard() {
  const { composition, toast } = useServices();
  const { auth } = composition;
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);

  if (!auth.available()) return null;

  const close = () => {
    setOpen(false);
    setError(null);
    setPassword('');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await auth[mode](email.trim(), password);
    setBusy(false);
    if (result.kind === 'failed') return setError(`account.error.${result.reason}`);
    close();
    toast.getState().show(t('account.welcome'));
  }

  return (
    <section className={styles.card} aria-label={t('account.title')}>
      <div className={styles.row}>
        <span style={{ fontSize: 30 }} aria-hidden="true">
          👤
        </span>
        <div style={{ flex: 1 }}>
          <b>{t('account.title')}</b>
          <div className={styles.muted}>
            {account ? t('account.signedIn', { email: account.email ?? '' }) : t('account.guest')}
          </div>
        </div>
        {account ? (
          <button
            type="button"
            className={styles.btn}
            style={{ flex: 'none' }}
            onClick={() => void auth.signOut()}
          >
            {t('account.signOut')}
          </button>
        ) : (
          <button
            type="button"
            className={styles.btn}
            style={{ flex: 'none' }}
            onClick={() => setOpen(true)}
          >
            {t('account.open')}
          </button>
        )}
      </div>

      {open && (
        <Modal title={t(`account.${mode}.title`)} onClose={close}>
          <form className={styles.sheet} onSubmit={(e) => void submit(e)}>
            <input
              type="email"
              value={email}
              autoComplete="email"
              aria-label={t('account.email')}
              placeholder={t('account.email')}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              value={password}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              aria-label={t('account.password')}
              placeholder={t('account.password')}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p className={styles.muted} role="alert">
                {t(error)}
              </p>
            )}
            <button
              type="submit"
              className={styles.btn}
              disabled={busy || !email.trim() || !password}
            >
              {busy ? t('account.sending') : t(`account.submit.${mode}`)}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setMode(mode === 'signUp' ? 'signIn' : 'signUp');
                setError(null);
              }}
            >
              {mode === 'signUp' ? t('account.switch.toSignIn') : t('account.switch.toSignUp')}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
