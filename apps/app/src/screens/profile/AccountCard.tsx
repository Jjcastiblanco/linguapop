import { useState, type FormEvent } from 'react';
import { useAccount, useServices } from '../../composition/context';
import { deleteAccount, signOut } from '../../stores';
import { t, type TextKey } from '../../i18n';
import { Modal } from '../../ui/Modal';
import styles from './ProfileScreen.module.css';

type Mode = 'signUp' | 'signIn';

/**
 * Cuenta de la persona (5.2): crear cuenta, iniciar y cerrar sesión con correo y contraseña. Sin
 * sesión la app sigue como invitado; no se muestra si la plataforma no tiene servicio de cuentas.
 */
export function AccountCard() {
  const { composition, toast, progress } = useServices();
  const { auth } = composition;
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<TextKey | null>(null);
  const [unsynced, setUnsynced] = useState<number | null>(null);

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

  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await auth.signInWithGoogle();
    // En la web, si va bien la página se va a Google; solo hay que seguir aquí si algo falló.
    if (result.kind === 'redirecting') return;
    setBusy(false);
    if (result.kind === 'failed') return setError(`account.error.${result.reason}`);
    if (result.kind === 'cancelled') return;
    close();
    toast.getState().show(t('account.welcome'));
  }

  async function leave(force = false) {
    if (busy) return;
    setBusy(true);
    const result = await signOut(composition, progress, { force });
    setBusy(false);
    if (result.kind === 'unsynced') return setUnsynced(result.pending);
    setUnsynced(null);
    if (result.kind === 'failed') toast.getState().show(t('account.error.error'));
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setDeleteError(null);
    const result = await deleteAccount(composition, progress);
    setBusy(false);
    if (result.kind === 'failed') return setDeleteError(`account.delete.error.${result.reason}`);
    setConfirmDelete(false);
    toast.getState().show(t('account.delete.done'));
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
      </div>

      {!account && (
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={() => setOpen(true)}>
            {t('account.open')}
          </button>
        </div>
      )}

      {account && (
        <div className={styles.row}>
          <button type="button" className={styles.btn} disabled={busy} onClick={() => void leave()}>
            {t('account.signOut')}
          </button>
          <button
            type="button"
            className={styles.btn}
            style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
            onClick={() => setConfirmDelete(true)}
          >
            {t('account.delete')}
          </button>
        </div>
      )}

      {unsynced !== null && account && (
        <Modal title={t('account.signOut.title')} onClose={() => setUnsynced(null)}>
          <p className={styles.muted}>{t('account.signOut.text', { count: unsynced })}</p>
          <div className={styles.sheet}>
            <button type="button" className={styles.btn} onClick={() => setUnsynced(null)}>
              {t('account.signOut.wait')}
            </button>
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => void leave(true)}
            >
              {t('account.signOut.force')}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && account && (
        <Modal
          title={t('account.delete.title')}
          onClose={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
        >
          <p className={styles.muted}>{t('account.delete.text')}</p>
          {deleteError && (
            <p className={styles.muted} role="alert">
              {t(deleteError)}
            </p>
          )}
          <div className={styles.sheet}>
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? t('account.sending') : t('account.delete.confirm')}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setConfirmDelete(false);
                setDeleteError(null);
              }}
            >
              {t('practice.cancel')}
            </button>
          </div>
        </Modal>
      )}

      {open && (
        <Modal title={t(`account.${mode}.title`)} onClose={close}>
          <form className={styles.sheet} onSubmit={(e) => void submit(e)}>
            {auth.googleAvailable() && (
              <>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={busy}
                  onClick={() => void google()}
                >
                  {busy ? t('account.google.opening') : t('account.google')}
                </button>
                <p className={styles.muted}>{t('account.or')}</p>
              </>
            )}
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
