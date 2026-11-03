import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioKey, collectSpokenTexts, seedUnits, type AudioManifest } from '@linguapop/content';

const dir = path.resolve(__dirname, '../../../public/audio');

/**
 * El audio pregrabado se genera con `pnpm audio:generar` y se sube al repositorio. Si el curso
 * cambia y no se regenera, esta prueba falla: así nada de lo que la app dice del curso se queda
 * sin grabación sin que nadie se entere.
 */
describe('audio pregrabado del curso', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
  ) as AudioManifest;
  const keys = new Set(manifest.keys);
  const spoken = collectSpokenTexts(seedUnits);

  it('cada texto que dice el curso tiene su grabación en el manifiesto', () => {
    const missing = spoken
      .filter((s) => !keys.has(audioKey(s.text, s.speed)))
      .map((s) => `${s.speed}: ${s.text}`);
    expect(missing, 'faltan grabaciones: corre `pnpm audio:generar`').toEqual([]);
  });

  it('cada clave del manifiesto tiene su archivo y no sobran archivos', () => {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'));
    expect(new Set(files.map((f) => f.slice(0, -4)))).toEqual(keys);
  });

  it('los archivos son MP3 con contenido', () => {
    for (const key of manifest.keys) {
      const { size } = fs.statSync(path.join(dir, `${key}.mp3`));
      expect(size, key).toBeGreaterThan(500);
    }
  });

  it('el audio del curso no pasa de 5 MB', () => {
    const bytes = manifest.keys.reduce(
      (sum, k) => sum + fs.statSync(path.join(dir, `${k}.mp3`)).size,
      0,
    );
    expect(bytes).toBeLessThan(5_000_000);
  });
});
