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
import { Mp3Encoder } from '@breezystack/lamejs';
import { KokoroTTS } from 'kokoro-js';
import { audioKey, collectSpokenTexts } from '../packages/content/src/audio.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unitsDir = path.join(root, 'packages/content/seed/units');
const outDir = path.join(root, 'apps/app/public/audio');
const force = process.argv.includes('--force');

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart';
/** Velocidad de Kokoro de cada grabación; la lenta coincide con la tortuga de la app. */
const KOKORO_SPEED = { normal: 1, slow: 0.6 };
const KBPS = 40;

const units = fs
  .readdirSync(unitsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(unitsDir, f), 'utf8')));
const spoken = collectSpokenTexts(units);
const wanted = new Map(spoken.map((s) => [audioKey(s.text, s.speed), s]));

fs.mkdirSync(outDir, { recursive: true });
const file = (key) => path.join(outDir, `${key}.mp3`);

function encodeMp3(samples, rate) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
  }
  const encoder = new Mp3Encoder(1, rate, KBPS);
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const part = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
    if (part.length) chunks.push(Buffer.from(part));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

const todo = [...wanted].filter(([key]) => force || !fs.existsSync(file(key)));
console.log(`${wanted.size} textos en el curso, ${todo.length} por generar`);

if (todo.length > 0) {
  const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'cpu' });
  let n = 0;
  for (const [key, { text, speed }] of todo) {
    const audio = await tts.generate(text, { voice: VOICE, speed: KOKORO_SPEED[speed] });
    fs.writeFileSync(file(key), encodeMp3(audio.audio, audio.sampling_rate));
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
