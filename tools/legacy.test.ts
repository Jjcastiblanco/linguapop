import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hash = (ruta: string) => createHash('sha256').update(readFileSync(ruta)).digest('hex');

// La copia en legacy/ debe ser idéntica al original mientras este exista.
const ARCHIVOS = [
  'linguapop.html',
  'sw.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/favicon-64.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

describe('copia heredada en legacy/', () => {
  it.each(ARCHIVOS)('legacy/%s existe', (archivo) => {
    expect(existsSync(`legacy/${archivo}`)).toBe(true);
  });

  it.each(ARCHIVOS)('legacy/%s es idéntico al original', (archivo) => {
    if (!existsSync(archivo)) return; // el original ya se retiró
    expect(hash(`legacy/${archivo}`)).toBe(hash(archivo));
  });
});
