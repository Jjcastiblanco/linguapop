// Genera el audio pregrabado del curso (AD-11) con Kokoro 82M en Node y lo guarda como MP3 en
// apps/app/public/audio, junto a un manifest.json con las claves que tienen grabación.
//
//   pnpm audio:generar            genera lo que falta y quita lo que ya no se usa
//   pnpm audio:generar --force    regenera todo
//
// Solo es una herramienta de desarrollo: ni Kokoro ni el codificador MP3 van dentro de la app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioKey, collectPairTexts, collectSpokenTexts } from '../packages/content/src/audio.ts';
import { loadSynthesizer } from './lib/kokoro.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unitsDir = path.join(root, 'packages/content/seed/units');
const outDir = path.join(root, 'apps/app/public/audio');
const force = process.argv.includes('--force');

const units = fs
  .readdirSync(unitsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(unitsDir, f), 'utf8')));
const pairs = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/content/seed/pairs.json'), 'utf8'),
);
const spoken = [...collectSpokenTexts(units), ...collectPairTexts(pairs)];
const wanted = new Map(spoken.map((s) => [audioKey(s.text, s.speed, s.voice), s]));

fs.mkdirSync(outDir, { recursive: true });
const file = (key) => path.join(outDir, `${key}.mp3`);

const todo = [...wanted].filter(([key]) => force || !fs.existsSync(file(key)));
console.log(`${wanted.size} textos en el curso, ${todo.length} por generar`);

if (todo.length > 0) {
  const synthesize = await loadSynthesizer();
  let n = 0;
  for (const [key, spoken] of todo) {
    fs.writeFileSync(file(key), await synthesize(spoken));
    n++;
    if (n % 25 === 0 || n === todo.length) console.log(`  ${n}/${todo.length}`);
  }
}

// Lo que ya no se usa se borra para que el sitio y el APK no carguen archivos muertos.
let removed = 0;
for (const name of fs.readdirSync(outDir)) {
  if (name.endsWith('.mp3') && !wanted.has(name.slice(0, -4))) {
    fs.rmSync(path.join(outDir, name));
    removed++;
  }
}
const keys = [...wanted.keys()].sort();
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({ version: 1, keys })}\n`);
const bytes = keys.reduce((sum, k) => sum + fs.statSync(file(k)).size, 0);
console.log(
  `manifest con ${keys.length} claves, ${(bytes / 1e6).toFixed(2)} MB, ${removed} archivos sobrantes quitados`,
);
