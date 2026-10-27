import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LISTEN_DEFAULT_TIMEOUT_MS,
  SPEAK_START_DELAY_MS,
  createWebSpeech,
  pickVoice,
  type RecognitionLike,
  type SpeechEnv,
  type SynthLike,
  type UtteranceLike,
  type VoiceLike,
} from './web-speech';

const VOCES: VoiceLike[] = [
  { name: 'Microsoft David', lang: 'en-US' },
  { name: 'Google español', lang: 'es-ES' },
  { name: 'Samantha', lang: 'en-US' },
  { name: 'Moira', lang: 'en-IE' },
];

type Modo = 'termina' | 'nunca' | { error: string };

/** Un navegador falso: la síntesis puede terminar, no avisar nunca, o fallar con un error. */
function sintesisFalsa(
  modo: Modo | ((n: number, u: UtteranceLike) => Modo) = 'termina',
  voces = VOCES,
) {
  const dichas: UtteranceLike[] = [];
  const textos: string[] = [];
  const synth: SynthLike & { cancelaciones: number } = {
    cancelaciones: 0,
    getVoices: () => voces,
    cancel() {
      this.cancelaciones++;
    },
    speak(u) {
      dichas.push(u);
      const m = typeof modo === 'function' ? modo(dichas.length, u) : modo;
      if (m === 'termina') setTimeout(() => u.onend?.(), 100);
      else if (m !== 'nunca') setTimeout(() => u.onerror?.({ error: m.error }), 10);
    },
  };
  const env: SpeechEnv = {
    synth,
    createUtterance: (text) => {
      textos.push(text);
      return { lang: '', voice: null, rate: 0, pitch: 0, onend: null, onerror: null };
    },
  };
  return { env, synth, dichas, textos };
}

type Resultado = { isFinal: boolean; alternativas: string[] };

function reconocimientoFalso() {
  const instancias: Array<RecognitionLike & { abortos: number; iniciado: boolean }> = [];
  const crear = () => {
    const r = {
      lang: '',
      interimResults: false,
      maxAlternatives: 0,
      continuous: true,
      onresult: null,
      onerror: null,
      onend: null,
      abortos: 0,
      iniciado: false,
      start() {
        this.iniciado = true;
      },
      abort() {
        this.abortos++;
      },
    } as RecognitionLike & { abortos: number; iniciado: boolean };
    instancias.push(r);
    return r;
  };
  const resultado = (r: RecognitionLike, ...lista: Resultado[]) =>
    r.onresult?.({
      results: lista.map((x) =>
        Object.assign(
          x.alternativas.map((transcript) => ({ transcript })),
          { isFinal: x.isFinal },
        ),
      ),
    });
  return { crear, instancias, resultado };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('elección de voz', () => {
  it('prefiere una voz femenina de inglés de EE. UU.', () => {
    expect(pickVoice(VOCES)?.name).toBe('Samantha');
  });

  it('si no hay femenina de EE. UU., una femenina en inglés; luego cualquier de EE. UU.; luego inglés', () => {
    expect(
      pickVoice([
        { name: 'Moira', lang: 'en-IE' },
        { name: 'David', lang: 'en-US' },
      ])?.name,
    ).toBe('Moira');
    expect(
      pickVoice([
        { name: 'Fred', lang: 'en-GB' },
        { name: 'David', lang: 'en-US' },
      ])?.name,
    ).toBe('David');
    expect(pickVoice([{ name: 'Fred', lang: 'en-GB' }])?.name).toBe('Fred');
    expect(pickVoice([{ name: 'Google español', lang: 'es-ES' }])).toBeNull();
    expect(pickVoice([{ name: 'Alex', lang: 'en' }])?.name).toBe('Alex');
  });
});

describe('capacidades', () => {
  it('sin síntesis ni reconocimiento no puede hablar ni escuchar, y no lanza', async () => {
    const voz = createWebSpeech({});
    expect(voz.capabilities()).toEqual({ canSpeak: false, canListen: false });
    expect(await voz.speak('hello')).toBe(false);
    expect(await voz.listen()).toEqual({ kind: 'unavailable', reason: 'unsupported' });
    expect(() => voz.cancel()).not.toThrow();
  });

  it('con síntesis y reconocimiento puede hacer ambas cosas', () => {
    const { env } = sintesisFalsa();
    const voz = createWebSpeech({ ...env, createRecognition: reconocimientoFalso().crear });
    expect(voz.capabilities()).toEqual({ canSpeak: true, canListen: true });
  });

  it('puede hablar sin poder escuchar (como en Firefox)', () => {
    expect(createWebSpeech(sintesisFalsa().env).capabilities()).toEqual({
      canSpeak: true,
      canListen: false,
    });
  });
});

describe('hablar', () => {
  it('dice la frase con voz en inglés, velocidad y tono, y termina cuando acaba', async () => {
    const { env, dichas, textos } = sintesisFalsa();
    const voz = createWebSpeech(env);
    const promesa = voz.speak('Good morning', { rate: 0.6, pitch: 1.2 });
    await vi.advanceTimersByTimeAsync(SPEAK_START_DELAY_MS + 100);
    expect(await promesa).toBe(true);
    expect(textos).toEqual(['Good morning']);
    expect(dichas[0]).toMatchObject({ lang: 'en-US', rate: 0.6, pitch: 1.2 });
    expect(dichas[0]!.voice?.name).toBe('Samantha');
  });

  it('usa velocidad y tono normales por defecto', async () => {
    const { env, dichas } = sintesisFalsa();
    const voz = createWebSpeech(env);
    const p = voz.speak('Hello');
    await vi.advanceTimersByTimeAsync(500);
    await p;
    expect(dichas[0]).toMatchObject({ rate: 1, pitch: 1 });
  });

  it('cancela lo anterior y espera un instante antes de hablar (evita perder la frase en Chrome)', async () => {
    const { env, synth, dichas } = sintesisFalsa();
    const voz = createWebSpeech(env);
    void voz.speak('One');
    expect(synth.cancelaciones).toBe(1);
    expect(dichas).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(SPEAK_START_DELAY_MS - 1);
    expect(dichas).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(dichas).toHaveLength(1);
  });

  it('pedir otra frase corta la anterior, que termina como no dicha', async () => {
    const { env } = sintesisFalsa('nunca');
    const voz = createWebSpeech(env);
    const primera = voz.speak('First phrase');
    await vi.advanceTimersByTimeAsync(100);
    const segunda = voz.speak('Second phrase');
    expect(await primera).toBe(false);
    voz.cancel();
    expect(await segunda).toBe(false);
  });

  it('si el navegador nunca avisa que terminó, la da por dicha pasado un tiempo razonable', async () => {
    const { env } = sintesisFalsa('nunca');
    const voz = createWebSpeech(env);
    let resuelta = false;
    void voz.speak('Hi').then(() => (resuelta = true));
    await vi.advanceTimersByTimeAsync(2400);
    expect(resuelta).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(resuelta).toBe(true);
  });

  it('cancelar con la voz en curso la deja como no dicha', async () => {
    const { env } = sintesisFalsa('nunca');
    const voz = createWebSpeech(env);
    const p = voz.speak('Long sentence here');
    await vi.advanceTimersByTimeAsync(100);
    voz.cancel();
    expect(await p).toBe(false);
  });

  it('si la voz elegida falla reintenta con la del navegador por defecto', async () => {
    const { env, dichas } = sintesisFalsa((n, u) =>
      u.voice ? { error: 'synthesis-failed' } : 'termina',
    );
    const voz = createWebSpeech(env);
    const p = voz.speak('Hello');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(true);
    expect(dichas.map((d) => d.voice?.name ?? null)).toEqual(['Samantha', null]);
    expect(voz.capabilities().canSpeak).toBe(true);
  });

  it('si también falla sin voz explícita, deja de decir que puede hablar (AD-11)', async () => {
    const { env } = sintesisFalsa({ error: 'synthesis-failed' });
    const voz = createWebSpeech(env);
    const p = voz.speak('Hello');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(false);
    expect(voz.capabilities().canSpeak).toBe(false);
    expect(await voz.speak('Again')).toBe(false); // ya ni lo intenta
  });

  it('"no permitido" (falta un gesto del usuario) no cuenta como avería: se puede reintentar', async () => {
    const { env } = sintesisFalsa({ error: 'not-allowed' });
    const voz = createWebSpeech(env);
    const p = voz.speak('Hello');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(false);
    expect(voz.capabilities().canSpeak).toBe(true);
  });

  it('un error de cancelación no es una avería', async () => {
    const { env } = sintesisFalsa({ error: 'interrupted' });
    const voz = createWebSpeech(env);
    const p = voz.speak('Hello');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(false);
    expect(voz.capabilities().canSpeak).toBe(true);
  });

  it('si el navegador lanza al hablar, lo toma como avería sin romper', async () => {
    const { env, synth } = sintesisFalsa();
    synth.speak = () => {
      throw new Error('boom');
    };
    const voz = createWebSpeech(env);
    const p = voz.speak('Hello');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(false);
    expect(voz.capabilities().canSpeak).toBe(false);
  });
});

describe('escuchar', () => {
  const preparar = () => {
    const rec = reconocimientoFalso();
    const voz = createWebSpeech({ ...sintesisFalsa().env, createRecognition: rec.crear });
    return { rec, voz };
  };

  it('configura el reconocimiento en inglés con alternativas y devuelve lo que oyó', async () => {
    const { rec, voz } = preparar();
    const p = voz.listen();
    const r = rec.instancias[0]!;
    expect(r).toMatchObject({
      lang: 'en-US',
      interimResults: true,
      maxAlternatives: 3,
      continuous: false,
      iniciado: true,
    });
    rec.resultado(r, { isFinal: true, alternativas: ['my name is ana', 'my name is anna'] });
    expect(await p).toEqual({ kind: 'heard', alternatives: ['my name is ana', 'my name is anna'] });
  });

  it('avisa de lo que se va entendiendo antes del resultado final', async () => {
    const { rec, voz } = preparar();
    const parciales: string[] = [];
    const p = voz.listen({ onInterim: (t) => parciales.push(t) });
    const r = rec.instancias[0]!;
    rec.resultado(r, { isFinal: false, alternativas: ['my'] });
    rec.resultado(r, { isFinal: false, alternativas: ['my name'] });
    rec.resultado(r, { isFinal: true, alternativas: ['my name is ana'] });
    expect(parciales).toEqual(['my', 'my name']);
    expect(await p).toMatchObject({ kind: 'heard' });
  });

  it('silencio si no se dice nada: error de "no se oyó", fin sin resultado o abortado', async () => {
    for (const evento of [
      (r: RecognitionLike) => r.onerror?.({ error: 'no-speech' }),
      (r: RecognitionLike) => r.onend?.(),
      (r: RecognitionLike) => r.onerror?.({ error: 'aborted' }),
    ]) {
      const { rec, voz } = preparar();
      const p = voz.listen();
      evento(rec.instancias[0]!);
      expect(await p).toEqual({ kind: 'silence' });
    }
  });

  it('si pasa el tiempo sin hablar, corta y devuelve silencio (11 segundos por defecto)', async () => {
    const { rec, voz } = preparar();
    const p = voz.listen();
    await vi.advanceTimersByTimeAsync(LISTEN_DEFAULT_TIMEOUT_MS - 1);
    expect(rec.instancias[0]!.abortos).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ kind: 'silence' });
    expect(rec.instancias[0]!.abortos).toBe(1);
  });

  it('respeta el tiempo indicado', async () => {
    const { voz } = preparar();
    const p = voz.listen({ timeoutMs: 3000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toEqual({ kind: 'silence' });
  });

  it.each([
    ['not-allowed', 'not-allowed'],
    ['service-not-allowed', 'not-allowed'],
    ['network', 'network'],
    ['audio-capture', 'no-microphone'],
    ['language-not-supported', 'unsupported'],
  ] as const)(
    'el error "%s" se traduce a "%s" y se recuerda: ya no dice que puede escuchar',
    async (error, razon) => {
      const { rec, voz } = preparar();
      const p = voz.listen();
      rec.instancias[0]!.onerror?.({ error });
      expect(await p).toEqual({ kind: 'unavailable', reason: razon });
      expect(voz.capabilities().canListen).toBe(false);
      expect(await voz.listen()).toEqual({ kind: 'unavailable', reason: razon });
      expect(rec.instancias).toHaveLength(1); // no vuelve a intentarlo
    },
  );

  it('un error desconocido no es permanente', async () => {
    const { rec, voz } = preparar();
    const p = voz.listen();
    rec.instancias[0]!.onerror?.({ error: 'extraño' });
    expect(await p).toEqual({ kind: 'unavailable', reason: 'error' });
    expect(voz.capabilities().canListen).toBe(true);
  });

  it('si el navegador no deja iniciar, lo toma como error sin lanzar', async () => {
    const rec = reconocimientoFalso();
    const voz = createWebSpeech({
      createRecognition: () => {
        const r = rec.crear();
        r.start = () => {
          throw new Error('ya iniciado');
        };
        return r;
      },
    });
    expect(await voz.listen()).toEqual({ kind: 'unavailable', reason: 'error' });
  });

  it('una nueva escucha corta la anterior, que termina en silencio', async () => {
    const { rec, voz } = preparar();
    const primera = voz.listen();
    const segunda = voz.listen();
    expect(await primera).toEqual({ kind: 'silence' });
    expect(rec.instancias[0]!.abortos).toBe(1);
    rec.resultado(rec.instancias[1]!, { isFinal: true, alternativas: ['hello'] });
    expect(await segunda).toMatchObject({ kind: 'heard' });
  });

  it('cancelar corta la escucha en curso', async () => {
    const { rec, voz } = preparar();
    const p = voz.listen();
    voz.cancel();
    expect(await p).toEqual({ kind: 'silence' });
    expect(rec.instancias[0]!.abortos).toBe(1);
  });

  it('una vez resuelta, los eventos tardíos no cambian el resultado', async () => {
    const { rec, voz } = preparar();
    const p = voz.listen();
    const r = rec.instancias[0]!;
    rec.resultado(r, { isFinal: true, alternativas: ['hello'] });
    r.onend?.();
    r.onerror?.({ error: 'network' });
    expect(await p).toMatchObject({ kind: 'heard' });
    expect(voz.capabilities().canListen).toBe(true);
  });
});
