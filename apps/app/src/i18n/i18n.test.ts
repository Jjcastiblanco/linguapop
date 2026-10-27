import { describe, expect, it } from 'vitest';
import { es } from './es';
import { t } from './index';

describe('catálogo de textos', () => {
  it('devuelve el texto en español de una clave', () => {
    expect(t('nav.learn')).toBe('Aprender');
    expect(t('app.name')).toBe('LinguaPop');
  });

  it('ninguna clave está vacía y todas las claves de navegación existen', () => {
    for (const [clave, texto] of Object.entries(es)) expect(texto.length, clave).toBeGreaterThan(0);
    for (const clave of ['nav.learn', 'nav.practice', 'nav.leagues', 'nav.profile'] as const) {
      expect(es[clave]).toBeDefined();
    }
  });
});
