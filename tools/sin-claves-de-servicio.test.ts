import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..');

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === 'node_modules') return [];
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

// El cliente solo conoce la URL y la clave anónima (AD-9): ninguna clave de servicio o secreta.
describe('sin claves de servicio en los clientes', () => {
  const prohibido = /service_role|SERVICE_ROLE|SUPABASE_SERVICE|sb_secret_/;

  it.each(['apps/app/src', 'apps/admin/src'])('%s no menciona ninguna', (dir) => {
    for (const ruta of archivos(join(RAIZ, dir)).filter((r) => /\.(tsx?|css|html)$/.test(r))) {
      expect(readFileSync(ruta, 'utf8'), ruta).not.toMatch(prohibido);
    }
  });
});

// La herramienta de publicación tampoco: quien publica lo hace con la sesión de su cuenta y su rol (13.8).
describe('sin claves de servicio en las herramientas', () => {
  it('scripts/ no menciona ninguna', () => {
    const prohibido = /service_role|SERVICE_ROLE|SUPABASE_SERVICE|sb_secret_/;
    for (const ruta of archivos(join(RAIZ, 'scripts')).filter((r) => /\.mjs$/.test(r))) {
      expect(readFileSync(ruta, 'utf8'), ruta).not.toMatch(prohibido);
    }
  });
});
