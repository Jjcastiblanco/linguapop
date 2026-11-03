import type { Unit } from './schema';

/**
 * Audio pregrabado del curso (AD-11): cada texto en inglés que la app puede decir tiene un archivo
 * `audio/<clave>.mp3` generado con anticipación. Este módulo es puro y lo comparten el script que
 * genera los archivos y la app que los reproduce, para que ambos nombren igual cada texto.
 */

/** Velocidad del archivo: la lenta (tortuga) se graba más despacio, no se estira al reproducir. */
export type AudioSpeed = 'normal' | 'slow';

/** Por debajo de esta velocidad se usa la grabación lenta; por encima, la normal con ajuste. */
export const SLOW_AT_MOST = 0.7;

/** El texto como se compara y se nombra: sin espacios sobrantes. */
export const audioText = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** Hash de 53 bits (cyrb53) en hexadecimal: igual en Node y en el navegador, sin API asíncrona. */
function hash53(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Nombre (sin extensión) del archivo de un texto a una velocidad. */
export const audioKey = (text: string, speed: AudioSpeed = 'normal'): string =>
  hash53(`${speed}|${audioText(text)}`);

/** Qué grabación usar para una velocidad pedida y con qué ajuste de reproducción. */
export function speedFor(rate: number): { speed: AudioSpeed; playbackRate: number } {
  return rate <= SLOW_AT_MOST
    ? { speed: 'slow', playbackRate: 1 }
    : { speed: 'normal', playbackRate: rate };
}

/** Lo que dice el archivo `audio/manifest.json`: las claves que tienen grabación. */
export type AudioManifest = { version: 1; keys: string[] };

export type SpokenText = { text: string; speed: AudioSpeed };

/**
 * Todo lo que la app dice con la voz del curso: las frases (enseñadas, escuchadas, escritas,
 * ordenadas y habladas) a las dos velocidades, y a velocidad normal las palabras sueltas de
 * «Ordenar» y de «Práctica», los pares de «Emparejar» y las opciones de «¿Cómo se dice…?».
 */
export function collectSpokenTexts(units: readonly Unit[]): SpokenText[] {
  const normal = new Set<string>();
  const slow = new Set<string>();
  const add = (set: Set<string>, text: string | undefined) => {
    const t = text ? audioText(text) : '';
    if (t) set.add(t);
  };
  const phrase = (text: string) => {
    add(normal, text);
    add(slow, text);
    for (const word of audioText(text).split(' ')) add(normal, word);
  };

  for (const unit of units) {
    for (const exercise of unit.exercises) {
      switch (exercise.type) {
        case 'listen':
        case 'speak':
        case 'write':
          phrase(exercise.en);
          break;
        case 'order':
          phrase(exercise.en);
          for (const word of exercise.extraWords) add(normal, word);
          break;
        case 'match':
          for (const pair of exercise.pairs) add(normal, pair.en);
          break;
        case 'mc':
          if (exercise.prompt.includes('Cómo se dice')) {
            for (const option of exercise.options) add(normal, option.text);
          }
          break;
      }
    }
    for (const lesson of unit.lessons) {
      for (const card of lesson.teach ?? []) phrase(card.en);
    }
  }
  return [
    ...[...normal].map((text): SpokenText => ({ text, speed: 'normal' })),
    ...[...slow].map((text): SpokenText => ({ text, speed: 'slow' })),
  ];
}
