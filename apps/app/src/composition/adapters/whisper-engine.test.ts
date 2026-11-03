import { describe, expect, it, vi } from 'vitest';
import { createWhisperEngine, type WorkerLike } from './whisper-engine';
import type { FromWorker, ToWorker } from './whisper-worker';

function entorno() {
  const enviados: ToWorker[] = [];
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn((m: ToWorker) => void enviados.push(m)),
    terminate: vi.fn(),
  };
  const emitir = (m: FromWorker) => worker.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  return { worker, enviados, emitir, motor: createWhisperEngine(() => worker) };
}

describe('motor de reconocimiento (Whisper)', () => {
  it('carga el modelo e informa el avance', async () => {
    const { motor, emitir, enviados } = entorno();
    const avance = vi.fn();
    const cargado = motor.load(avance);
    expect(enviados).toEqual([{ type: 'load' }]);
    emitir({ type: 'progress', fraction: 0.4 });
    emitir({ type: 'ready' });
    await cargado;
    expect(avance).toHaveBeenCalledWith(0.4);
  });

  it('si el worker falla al cargar, la carga se rechaza con el motivo', async () => {
    const { motor, emitir, worker } = entorno();
    const cargado = motor.load(() => undefined);
    emitir({ type: 'error', message: 'sin red' });
    await expect(cargado).rejects.toThrow('sin red');
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('si no se puede crear el worker, la carga se rechaza', async () => {
    const motor = createWhisperEngine(() => {
      throw new Error('sin worker');
    });
    await expect(motor.load(() => undefined)).rejects.toThrow('sin worker');
  });

  async function listo() {
    const e = entorno();
    const cargado = e.motor.load(() => undefined);
    e.emitir({ type: 'ready' });
    await cargado;
    return e;
  }

  it('transcribe: manda el audio y devuelve el texto', async () => {
    const { motor, enviados, emitir } = await listo();
    const audio = new Float32Array([0.1, 0.2]);
    const dicho = motor.transcribe(audio);
    expect(enviados.at(-1)).toMatchObject({ type: 'run', id: 1 });
    emitir({ type: 'text', id: 1, text: ' Hello.' });
    expect(await dicho).toBe(' Hello.');
  });

  it('si el reconocimiento da error, lo lanza con el motivo', async () => {
    const { motor, emitir } = await listo();
    const dicho = motor.transcribe(new Float32Array(1));
    emitir({ type: 'error', id: 1, message: 'el reconocimiento sin respuesta tras 60 s' });
    await expect(dicho).rejects.toThrow('sin respuesta');
  });

  it('sin cargar no transcribe', async () => {
    const { motor } = entorno();
    await expect(motor.transcribe(new Float32Array(1))).rejects.toThrow('sin cargar');
  });
});
