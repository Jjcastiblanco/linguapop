import { t, type TextKey } from '../i18n';

/** Pantalla provisional hasta que su historia la construya. */
export function Placeholder({ title }: { title: TextKey }) {
  return (
    <section>
      <h2>{t(title)}</h2>
      <p>{t('screen.underConstruction')}</p>
    </section>
  );
}
