import { useState } from 'react';
import { useServices } from '../composition/context';
import { en, instructionsInEnglish, type InstructionKey } from '../i18n/en';
import { t } from '../i18n';
import styles from './Instruction.module.css';

/**
 * Instrucción de un ejercicio: en español en la unidad 1 y en inglés después, con un botón «ES»
 * que enseña la traducción al español a un toque.
 */
export function Instruction({ k, exerciseId }: { k: InstructionKey; exerciseId: string }) {
  const { composition } = useServices();
  const [shown, setShown] = useState(false);
  if (!instructionsInEnglish(composition.course.units, exerciseId)) return <>{t(k)}</>;
  return (
    <>
      <span lang="en">{en[k]}</span>{' '}
      <button
        type="button"
        className={styles.es}
        aria-label={t('instruction.translate')}
        title={t('instruction.translate')}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
      >
        ES
      </button>
      {shown && (
        <span className={styles.translation} lang="es" data-testid="instruction-es">
          {t(k)}
        </span>
      )}
    </>
  );
}
