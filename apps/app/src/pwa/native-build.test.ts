import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const appDir = resolve(fileURLToPath(new URL('../..', import.meta.url)));
let out = '';

const archivos = (dir = out): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? archivos(join(dir, e.name)).map((f) => `${e.name}/${f}`) : [e.name],
  );
const js = () => archivos().filter((f) => f.endsWith('.js'));

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'linguapop-native-'));
  // Se compila con la configuración real de la app en modo native, no con una copia.
  await build({
    root: appDir,
    configFile: join(appDir, 'vite.config.ts'),
    mode: 'native',
    logLevel: 'silent',
    build: { outDir: out, emptyOutDir: true },
  });
}, 120_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('build nativo (modo native)', () => {
  it('trae la app: index.html y su JavaScript', () => {
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(js().length).toBeGreaterThan(0);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toMatch(/<script[^>]+src="\/assets\/[^"]+\.js"/);
  });

  it('no trae service worker, manifiesto ni la versión heredada', () => {
    const todos = archivos();
    expect(todos.filter((f) => /(^|\/)sw\.js$/.test(f))).toEqual([]);
    expect(todos.filter((f) => /workbox/i.test(f))).toEqual([]);
    expect(todos.filter((f) => /manifest\.webmanifest$/.test(f))).toEqual([]);
    expect(todos.filter((f) => /(^|\/)legacy(\/|$)/.test(f))).toEqual([]);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).not.toContain('manifest');
  });

  it('el código no registra ningún service worker', () => {
    for (const f of js()) expect(readFileSync(join(out, f), 'utf8')).not.toContain('serviceWorker');
  });

  it('el código arranca la app en #root', () => {
    const todo = js()
      .map((f) => readFileSync(join(out, f), 'utf8'))
      .join('\n');
    expect(todo).toContain('No se encontró el elemento #root');
  });
});
