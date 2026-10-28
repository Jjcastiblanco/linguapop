import { currentHearts, dayKey, visibleStreak } from '@linguapop/domain';
import { useProgress, useServices } from '../composition/context';
import { t } from '../i18n';
import { Fox } from '../mascots';
import styles from './TopBar.module.css';

/** Barra superior: marca, racha, gemas, vidas y cambio de tema. */
export function TopBar({ dark }: { dark: boolean }) {
  const { composition, ui } = useServices();
  const progress = useProgress((s) => s.progress);
  const pro = progress.settings.plan === 'pro';
  const today = dayKey(composition.clock.now(), progress.settings.timeZone);
  const streak = visibleStreak(progress.streak, today, progress.settings.plan);
  const hearts = pro ? t('topbar.unlimited') : String(currentHearts(progress, today));

  return (
    <header className={styles.bar}>
      <div className={styles.logo}>
        <Fox mood="idle" width={28} decorative />
        <span className={styles.name}>{t('app.name')}</span>
        {pro && <span className={styles.pro}>{t('app.pro')}</span>}
      </div>
      <div className={styles.chip} role="status" aria-label={t('topbar.streak')}>
        <span aria-hidden="true">🔥</span>
        <span data-testid="streak">{streak}</span>
      </div>
      <div className={styles.chip} role="status" aria-label={t('topbar.gems')}>
        <span aria-hidden="true">💎</span>
        <span data-testid="gems">{progress.gems}</span>
      </div>
      <div className={styles.chip} role="status" aria-label={t('topbar.hearts')}>
        <span aria-hidden="true">❤️</span>
        <span data-testid="hearts">{hearts}</span>
      </div>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={t('topbar.theme')}
        onClick={() => void ui.getState().setTheme(dark ? 'light' : 'dark')}
      >
        <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
      </button>
    </header>
  );
}
