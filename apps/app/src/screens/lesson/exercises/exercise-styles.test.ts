import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./Exercise.module.css', import.meta.url)), 'utf8');

describe('estilos de ejercicios', () => {
  // `.selected` y `.bad` están definidos antes que `.pairButton` y tienen su misma especificidad:
  // sin una regla `.pairButton.<estado>` el botón base los pisaba y la pareja elegida no se veía.
  it.each(['selected', 'bad'])(
    'el botón de emparejar tiene su propia regla para el estado %s',
    (estado) => {
      expect(css).toMatch(new RegExp(`\\.pairButton\\.${estado}\\s*\\{`));
    },
  );

  it('la regla del estado seleccionado resalta con el color azul', () => {
    const regla = /\.pairButton\.selected\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(regla).toContain('border-color: var(--blue)');
    expect(regla).toContain('background');
  });
});
