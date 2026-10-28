import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');

// jsdom no calcula diseños: estas pruebas solo protegen las reglas que hacen que la app quepa en un móvil.
describe('adaptación a móviles', () => {
  it('el viewport cubre toda la pantalla para que valgan las zonas seguras', () => {
    expect(leer('../../index.html')).toMatch(
      /name="viewport"\s+content="width=device-width, initial-scale=1, viewport-fit=cover"/,
    );
  });

  it('usa el alto dinámico del móvil y no deja que nada ensanche la página', () => {
    const tema = leer('./theme.css');
    expect(tema).toMatch(/min-height:\s*100dvh/);
    expect(tema).toMatch(/overflow-x:\s*clip/);
    expect(leer('../ui/Modal.module.css')).toMatch(/max-height:\s*88dvh/);
  });

  it('la barra superior cede el nombre de la app en pantallas estrechas', () => {
    const barra = leer('../shell/TopBar.module.css');
    expect(barra).toMatch(/@media \(max-width: 440px\)\s*\{\s*\.name\s*\{\s*display:\s*none/);
    expect(barra).toMatch(/@media \(max-width: 360px\)/);
  });

  it('las cabeceras de pantalla completa respetan la muesca', () => {
    expect(leer('../shell/TopBar.module.css')).toContain('env(safe-area-inset-top)');
    expect(leer('../screens/lesson/LessonScreen.module.css')).toContain('env(safe-area-inset-top)');
    expect(leer('../screens/call/CallScreen.module.css')).toContain('env(safe-area-inset-top)');
  });
});
