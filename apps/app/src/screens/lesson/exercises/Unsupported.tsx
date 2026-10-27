import { t } from '../../../i18n';
import styles from './Exercise.module.css';

/** Marcador de los tipos de ejercicio que llegan con la historia siguiente (emparejar, escuchar y hablar). */
export function Unsupported() {
  return <div className={styles.unsupported}>{t('lesson.unsupported')}</div>;
}
