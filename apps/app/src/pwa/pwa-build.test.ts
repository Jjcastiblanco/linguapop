import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const appDir = resolve(fileURLToPath(new URL('../..', import.meta.url)));
let out = '';
let sw = '';

const leer = (archivo: string) => readFileSync(join(out, archivo), 'utf8');

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'linguapop-pwa-'));
  // Se compila con la configuración real de la app, no con una copia.
  await build({
    root: appDir,
    configFile: join(appDir, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: out, emptyOutDir: true },
  });
  sw = leer('sw.js');
}, 120_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

const precache = () => [...sw.matchAll(/"?url"?\s*:\s*"([^"]+)"/g)].map((m) => m[1]!);

describe('PWA generada', () => {
  it('el manifiesto describe una app instalable con sus íconos', () => {
    const manifest = JSON.parse(leer('manifest.webmanifest')) as {
      name: string;
      scope: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };
    expect(manifest).toMatchObject({
      name: 'LinguaPop – Aprende inglés jugando',
      scope: '/',
      start_url: '/',
      display: 'standalone',
    });
    expect(manifest.icons.map((i) => `${i.sizes}:${i.purpose}`).sort()).toEqual([
      '192x192:any',
      '512x512:any',
      '512x512:maskable',
    ]);
    for (const icon of manifest.icons) expect(existsSync(join(out, icon.src))).toBe(true);
    expect(leer('index.html')).toContain('<link rel="manifest" href="/manifest.webmanifest">');
  });

  it('el service worker precachea la app y el contenido semilla, y nada de /legacy/', () => {
    const urls = precache();
    expect(urls).toContain('index.html');
    expect(urls.some((u) => u.endsWith('.js'))).toBe(true);
    expect(urls.some((u) => u.endsWith('.css'))).toBe(true);
    expect(urls).toContain('icons/icon-192.png');
    expect(urls.filter((u) => /legacy/i.test(u))).toEqual([]);
    expect(readdirSync(out).includes('legacy')).toBe(false);

    // La semilla va dentro del código que se precachea.
    const js = urls.find((u) => u.endsWith('.js') && u.startsWith('assets/'))!;
    expect(leer(js)).toContain('Presentarse');
  });

  it('la navegación cae en index.html y excluye /legacy/', () => {
    expect(sw).toMatch(/createHandlerBoundToURL\(\s*"index\.html"\s*\)/);
    const denylist = /denylist:\s*\[\s*\/(.+?)\/\s*\]/.exec(sw);
    expect(denylist).not.toBeNull();
    const regla = new RegExp(denylist![1]!);

    for (const ruta of [
      '/legacy',
      '/legacy/',
      '/legacy/linguapop.html',
      '/legacy/icons/icon-192.png',
    ])
      expect(regla.test(ruta), ruta).toBe(true);
    for (const ruta of ['/', '/aprender', '/perfil', '/leccion/u-saludos/u-saludos-l1', '/legacyx'])
      expect(regla.test(ruta), ruta).toBe(false);
  });

  it('una versión nueva espera la orden del estudiante en vez de activarse sola', () => {
    // Con `registerType: 'prompt'` el service worker solo se salta la espera si la página se lo pide.
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).not.toMatch(/clientsClaim\(/);
  });

  it('el service worker no registra rutas de caché para otros orígenes', () => {
    expect(sw).not.toMatch(/registerRoute\([^)]*https?:/);
  });
});
