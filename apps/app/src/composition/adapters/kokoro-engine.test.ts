import { describe, expect, it, vi } from 'vitest';
import { createKokoroEngine, type AudioPlayer, type EngineEnv } from './kokoro-engine';
import type { FromWorker, ToWorker } from './kokoro-worker';

function entornoFalso() {
  const enviados: ToWorker[] = [];
  const worker = {
    onmessage: null as ((e: MessageEvent<FromWorker>) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
    postMessage: vi.fn((m: ToWorker) => void enviados.push(m)),
    terminate: vi.fn(),
  };
  const emitir = (m: FromWorker) => worker.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  const player: AudioPlayer & { tocado: Float32Array[] } = {
    tocado: [],
    play: vi.fn(async (s: Float32Array) => void player.tocado.push(s)),
    stop: vi.fn(),
  };
  const env: EngineEnv = { createWorker: () => worker, createPlayer: () => player };
  return { env, worker, enviados, emitir, player };
}

describe('motor de voz de respaldo', () => {
  it('carga el modelo, informa el avance y queda listo', async () => {
    const { env, emitir, enviados } = entornoFalso();
    const motor = createKokoroEngine(env);
    const avance = vi.fn();
    const cargado = motor.load(avance);
    expect(enviados).toEqual([{ type: 'load' }]);
    emitir({ type: 'progress', fraction: 0.4 });
    emitir({ type: 'ready' });
    await cargado;
    expect(avance).toHaveBeenCalledWith(0.4);
  });

  it('si el worker falla al cargar, la carga se rechaza', async () => {
    const { env, emitir, worker } = entornoFalso();
    const cargado = createKokoroEngine(env).load(() => undefined);
    emitir({ type: 'error', message: 'sin red' });
    await expect(cargado).rejects.toThrow('sin red');
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('si no se puede crear el worker, la carga se rechaza', async () => {
    const motor = createKokoroEngine({
      createWorker: () => {
        throw new Error('sin worker');
      },
      createPlayer: () => entornoFalso().player,
    });
    await expect(motor.load(() => undefined)).rejects.toThrow('sin worker');
  });

  async function listo() {
    const e = entornoFalso();
    const motor = createKokoroEngine(e.env);
    const cargado = motor.load(() => undefined);
    e.emitir({ type: 'ready' });
    await cargado;
    return { ...e, motor };
  }

  it('habla: pide la frase con la velocidad y reproduce lo que vuelve', async () => {
    const { motor, enviados, emitir, player } = await listo();
    const dicho = motor.speak('hello', { rate: 0.55 });
    expect(enviados.at(-1)).toEqual({ type: 'speak', id: 1, text: 'hello', speed: 0.55 });
    const muestras = new Float32Array([0.1, 0.2]);
    emitir({ type: 'audio', id: 1, samples: muestras, rate: 24000 });
    expect(await dicho).toBe(true);
    expect(player.tocado).toEqual([muestras]);
  });

  it('si la síntesis da error, devuelve false', async () => {
    const { motor, emitir } = await listo();
    const dicho = motor.speak('hello');
    emitir({ type: 'error', id: 1, message: 'x' });
    expect(await dicho).toBe(false);
  });

  it('cancelar descarta lo que aún se genera', async () => {
    const { motor, emitir, player } = await listo();
    const dicho = motor.speak('hello');
    motor.cancel();
    emitir({ type: 'audio', id: 1, samples: new Float32Array(1), rate: 24000 });
    expect(await dicho).toBe(false);
    expect(player.tocado).toEqual([]);
  });

  it('sin cargar no habla', async () => {
    const { env } = entornoFalso();
    expect(await createKokoroEngine(env).speak('hello')).toBe(false);
  });
});
