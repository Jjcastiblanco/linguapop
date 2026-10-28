import { useServices, useUpdateAvailable } from '../composition/context';
import { t } from '../i18n';
import styles from './UpdateBanner.module.css';

/**
 * Avisa de que hay una versión nueva y deja que el estudiante decida cuándo activarla. Vive en el
 * marco de las pantallas principales: nunca aparece sobre una lección ni una llamada en curso.
 */
export function UpdateBanner() {
  const { update } = useServices().composition;
  if (!useUpdateAvailable()) return null;
  return (
    <div className={styles.banner} role="status" data-testid="update-banner">
      <span className={styles.text}>{t('update.available')}</span>
      <button type="button" className={styles.apply} onClick={() => update.apply()}>
        {t('update.apply')}
      </button>
      <button type="button" className={styles.later} onClick={() => update.dismiss()}>
        {t('update.later')}
      </button>
    </div>
  );
}
