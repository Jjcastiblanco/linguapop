import { describe, expect, it, vi } from 'vitest';
import { SOUND_DEFS, createWebSound, type AudioContextLike } from './web-sound';

type Tono = { type: string; freq: number; start: number; stop: number; volume: number; at: number };

function contextoFalso(estado = 'running') {
  const tonos: Tono[] = [];
  let ahora = 10;
  const ctx = {
    get currentTime() {
      return ahora;
    },
    state: estado,
    destination: {},
    resume: vi.fn(async () => undefined),
    createOscillator() {
      const tono: Partial<Tono> = {};
      return {
        set type(v: string) {
          tono.type = v;
        },
        frequency: {
          set value(v: number) {
            tono.freq = v;
          },
        },
        connect: () => undefined,
        start: (t: number) => {
          tono.start = t;
        },
        stop: (t: number) => {
          tono.stop = t;
          tonos.push({ ...(tono as Tono), at: tonos.length });
        },
      };
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: () => undefined,
          linearRampToValueAtTime: (v: number) => {
            void v;
          },
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      };
    },
  };
  return {
    ctx: ctx as unknown as AudioContextLike & { resume: ReturnType<typeof vi.fn> },
    tonos,
    avanzar: (s: number) => (ahora += s),
  };
}

describe('sonidos de la app', () => {
  it('definen los seis efectos de la versión heredada', () => {
    expect(Object.keys(SOUND_DEFS).sort()).toEqual(['bad', 'click', 'hangup', 'ok', 'ring', 'win']);
  });

  it('acierto: dos tonos triangulares ascendentes (660 y 880 Hz)', () => {
    expect(SOUND_DEFS.ok.map((t) => [t.freq, t.type, t.start])).toEqual([
      [660, 'triangle', 0],
      [880, 'triangle', 0.1],
    ]);
  });

  it('error: dos tonos graves descendentes de sierra', () => {
    expect(SOUND_DEFS.bad.map((t) => [t.freq, t.type])).toEqual([
      [210, 'sawtooth'],
      [150, 'sawtooth'],
    ]);
  });

  it('victoria: cuatro notas ascendentes, una cada 0,12 segundos', () => {
    expect(SOUND_DEFS.win.map((t) => t.freq)).toEqual([523, 659, 784, 1047]);
    expect(SOUND_DEFS.win.map((t) => Math.round(t.start * 100) / 100)).toEqual([
      0, 0.12, 0.24, 0.36,
    ]);
  });

  it('llamada: suena dos veces con dos tonos cada vez', () => {
    expect(SOUND_DEFS.ring).toHaveLength(4);
    expect(SOUND_DEFS.ring.map((t) => t.start)).toEqual([0, 0, 1.1, 1.1]);
  });

  it('reproduce cada tono con su frecuencia, forma de onda y momento', () => {
    const { ctx, tonos } = contextoFalso();
    createWebSound({ createContext: () => ctx }).play('ok');
    expect(tonos).toHaveLength(2);
    expect(tonos.map((t) => [t.freq, t.type, t.start])).toEqual([
      [660, 'triangle', 10],
      [880, 'triangle', 10.1],
    ]);
    expect(tonos[0]!.stop).toBeCloseTo(10 + 0.14 + 0.05);
  });

  it('el contexto de audio se crea una sola vez y solo al sonar el primer efecto', () => {
    const { ctx } = contextoFalso();
    const crear = vi.fn(() => ctx);
    const sonido = createWebSound({ createContext: crear });
    expect(crear).not.toHaveBeenCalled();
    sonido.play('click');
    sonido.play('click');
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it('reanuda un contexto suspendido por el navegador', () => {
    const { ctx } = contextoFalso('suspended');
    createWebSound({ createContext: () => ctx }).play('click');
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('con el sonido desactivado no suena ni crea el contexto; se puede reactivar', () => {
    const { ctx, tonos } = contextoFalso();
    const crear = vi.fn(() => ctx);
    let activo = false;
    const sonido = createWebSound({ createContext: crear, isEnabled: () => activo });
    sonido.play('ok');
    expect(crear).not.toHaveBeenCalled();
    expect(tonos).toHaveLength(0);
    activo = true;
    sonido.play('ok');
    expect(tonos).toHaveLength(2);
  });

  it('la fuente de "sonido activado" se puede reemplazar después', () => {
    const { ctx, tonos } = contextoFalso();
    const sonido = createWebSound({ createContext: () => ctx });
    sonido.setEnabledSource(() => false);
    sonido.play('ok');
    expect(tonos).toHaveLength(0);
  });

  it('nunca lanza: sin Web Audio, con un contexto que falla al crearse o al sonar', () => {
    expect(() => createWebSound({ createContext: () => null }).play('ok')).not.toThrow();
    expect(() =>
      createWebSound({
        createContext: () => {
          throw new Error('sin audio');
        },
      }).play('ok'),
    ).not.toThrow();
    const roto = {
      ...contextoFalso().ctx,
      createOscillator: () => {
        throw new Error('boom');
      },
    } as unknown as AudioContextLike;
    expect(() => createWebSound({ createContext: () => roto }).play('win')).not.toThrow();
  });
});
