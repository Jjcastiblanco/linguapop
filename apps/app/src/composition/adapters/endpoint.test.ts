import { describe, expect, it } from 'vitest';
import { cleanTranscript, createEndpointDetector } from './endpoint';

/** Alimenta el detector con un volumen cada 50 ms y devuelve la primera decisión que no sea seguir. */
function correr(
  detector: ReturnType<typeof createEndpointDetector>,
  medidas: Array<[rms: number, ms: number]>,
) {
  let ultima: ReturnType<typeof detector.feed> = 'continue';
  for (const [rms, t] of medidas) {
    ultima = detector.feed(rms, t);
    if (ultima !== 'continue') return { decision: ultima, en: t };
  }
  return { decision: ultima, en: null };
}
const serie = (desde: number, hasta: number, rms: number): Array<[number, number]> =>
  Array.from({ length: Math.floor((hasta - desde) / 50) + 1 }, (_, i) => [rms, desde + i * 50]);

describe('detector de fin de frase', () => {
  it('da la frase por terminada tras 1,2 s de silencio después de hablar', () => {
    const d = createEndpointDetector({ waitMs: 11_000 });
    const r = correr(d, [
      ...serie(0, 500, 0),
      ...serie(550, 1500, 0.1),
      ...serie(1550, 4000, 0.001),
    ]);
    expect(r.decision).toBe('speech-ended');
    expect(r.en).toBeGreaterThanOrEqual(1500 + 1200);
    expect(d.heardSpeech()).toBe(true);
  });

  it('sigue mientras se habla con pausas cortas', () => {
    const d = createEndpointDetector({ waitMs: 11_000 });
    const medidas = [
      ...serie(0, 1000, 0.1),
      ...serie(1050, 1700, 0.001), // pausa de 0,65 s
      ...serie(1750, 2500, 0.1),
    ];
    expect(correr(d, medidas).decision).toBe('continue');
  });

  it('si nadie habla en el tiempo de espera, no hubo habla', () => {
    const d = createEndpointDetector({ waitMs: 3000 });
    const r = correr(d, serie(0, 5000, 0.001));
    expect(r.decision).toBe('no-speech');
    expect(r.en).toBe(3000);
    expect(d.heardSpeech()).toBe(false);
  });

  it('un ruido más corto que el mínimo no cuenta como frase', () => {
    const d = createEndpointDetector({ waitMs: 11_000, minSpeechMs: 250 });
    const r = correr(d, [[0.1, 0], [0.001, 50], ...serie(100, 2000, 0.001)]);
    expect(r.decision).toBe('no-speech');
  });

  it('el umbral es configurable', () => {
    const d = createEndpointDetector({ waitMs: 1000, threshold: 0.5 });
    expect(correr(d, serie(0, 2000, 0.1)).decision).toBe('no-speech');
  });
});

describe('limpiar lo que escribe Whisper', () => {
  it('deja el texto y quita las marcas de ruido y los espacios', () => {
    expect(cleanTranscript(' The soup is delicious.')).toBe('The soup is delicious.');
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanTranscript(' (music) Hello [noise] there ')).toBe('Hello there');
    expect(cleanTranscript('*coughs* Nice to meet you')).toBe('Nice to meet you');
  });
});
