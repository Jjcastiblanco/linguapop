import { describe, expect, it, vi } from 'vitest';
import { createModelPack, type ModelEngine, type PackStorage } from './model-pack';

const KEY = 'linguapop:test-pack:v1';

function almacen(
  inicial: Record<string, string> = {},
): PackStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(inicial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const motor = () => ({
  load: vi.fn<ModelEngine['load']>(async (onProgress) => onProgress(0.5)),
});

describe('modelo de respaldo descargable', () => {
  it('no descarga nada hasta que se pide', () => {
    const e = motor();
    const { pack } = createModelPack(e, 40, KEY, almacen());
    expect(pack.state()).toBe('idle');
    expect(pack.sizeMb).toBe(40);
    expect(e.load).not.toHaveBeenCalled();
  });

  it('descargar pasa por downloading con avance, termina ready y lo recuerda', async () => {
    const e = motor();
    const mem = almacen();
    const { pack } = createModelPack(e, 40, KEY, mem);
    const avisos = vi.fn();
    pack.subscribe(avisos);
    const hecho = pack.download();
    expect(pack.state()).toBe('downloading');
    expect(await hecho).toBe(true);
    expect(pack.state()).toBe('ready');
    expect(pack.progress()).toBe(1);
    expect(avisos).toHaveBeenCalled();
    expect(mem.data.get(KEY)).toBe('1');
  });

  it('dos pedidos seguidos comparten una sola descarga', async () => {
    const e = motor();
    const { pack } = createModelPack(e, 40, KEY, almacen());
    await Promise.all([pack.download(), pack.download()]);
    expect(e.load).toHaveBeenCalledTimes(1);
  });

  it('si la descarga falla queda failed con el motivo, sin recordarla, y se puede reintentar', async () => {
    const e = motor();
    e.load.mockRejectedValueOnce(new Error('sin red'));
    const mem = almacen();
    const { pack } = createModelPack(e, 40, KEY, mem);
    expect(await pack.download()).toBe(false);
    expect(pack.state()).toBe('failed');
    expect(pack.error()).toBe('sin red');
    expect(mem.data.has(KEY)).toBe(false);
    expect(await pack.download()).toBe(true);
    expect(pack.error()).toBeNull();
  });

  it('si ya se descargó antes arranca ready y lo carga en el primer uso', async () => {
    const e = motor();
    const { pack, use } = createModelPack(e, 40, KEY, almacen({ [KEY]: '1' }));
    expect(pack.state()).toBe('ready');
    expect(await use(async () => 'hecho')).toBe('hecho');
    expect(e.load).toHaveBeenCalledTimes(1);
  });

  it('sin descargar no se puede usar', async () => {
    const { use } = createModelPack(motor(), 40, KEY, almacen());
    await expect(use(async () => 1)).rejects.toThrow('no está descargado');
  });

  it('si la copia guardada ya no carga, olvida la marca y vuelve a ofrecer la descarga', async () => {
    const e = motor();
    e.load.mockRejectedValueOnce(new Error('caché borrada'));
    const mem = almacen({ [KEY]: '1' });
    const { pack, use } = createModelPack(e, 40, KEY, mem);
    await expect(use(async () => 1)).rejects.toThrow('caché borrada');
    expect(pack.state()).toBe('idle');
    expect(mem.data.has(KEY)).toBe(false);
  });

  it('si el uso falla con el modelo cargado guarda el motivo, sigue listo y lo borra al funcionar', async () => {
    const { pack, use } = createModelPack(motor(), 40, KEY, almacen());
    await pack.download();
    await expect(use(async () => Promise.reject(new Error('sin respuesta')))).rejects.toThrow();
    expect(pack.error()).toBe('sin respuesta');
    expect(pack.state()).toBe('ready');
    expect(await use(async () => 'ok')).toBe('ok');
    expect(pack.error()).toBeNull();
  });

  it('un almacenamiento que lanza no rompe nada', async () => {
    const roto: PackStorage = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    const { pack } = createModelPack(motor(), 40, KEY, roto);
    expect(pack.state()).toBe('idle');
    expect(await pack.download()).toBe(true);
  });
});
