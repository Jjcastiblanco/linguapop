import { describe, expect, it, vi } from 'vitest';
import { createRemoteClips, type ClipCache } from './remote-clips';

const BASE = 'https://proyecto.supabase.co/storage/v1/object/public/audio/';
const A = '0123456789abcd';
const B = 'abcdef0123456a';

function cacheEnMemoria(): ClipCache & { datos: Map<string, Response> } {
  const datos = new Map<string, Response>();
  return {
    datos,
    match: async (url) => datos.get(url)?.clone(),
    put: async (url, response) => void datos.set(url, response.clone()),
    keys: async () => [...datos.keys()],
    delete: async (url) => datos.delete(url),
  };
}

const clip = (bytes = 100, type = 'audio/mpeg') =>
  new Response(new Blob([new Uint8Array(bytes)], { type }), { status: 200 });

function montar(
  opciones: { fetchClip?: typeof fetch; cache?: ClipCache | null; saveData?: boolean } = {},
) {
  const revokeUrl = vi.fn();
  const cache = opciones.cache === undefined ? cacheEnMemoria() : opciones.cache;
  const fetchClip = opciones.fetchClip ?? vi.fn(async () => clip());
  const log = vi.fn();
  const clips = createRemoteClips({
    openCache: async () => cache,
    fetchClip: fetchClip as typeof fetch,
    objectUrl: (blob) => `blob:${blob.size}`,
    revokeUrl,
    saveData: () => opciones.saveData ?? false,
    log,
  });
  return { clips, cache, fetchClip: fetchClip as ReturnType<typeof vi.fn>, log, revokeUrl };
}

describe('clips de audio remotos', () => {
  it('sin audio registrado no conoce ninguna clave', async () => {
    const { clips } = montar();
    expect(clips.has(A)).toBe(false);
    await expect(clips.urlOf(A)).rejects.toThrow('clip desconocido');
  });

  it('al registrar el audio guarda por adelantado lo que falta, una sola vez cada clip', async () => {
    const { clips, fetchClip, cache } = montar();
    await clips.use({ baseUrl: BASE, keys: [A, B] });
    expect(fetchClip).toHaveBeenCalledTimes(2);
    expect(fetchClip).toHaveBeenCalledWith(
      `${BASE}${A}.mp3`,
      expect.objectContaining({ credentials: 'omit' }),
    );
    expect([...(cache as ReturnType<typeof cacheEnMemoria>).datos.keys()].sort()).toEqual(
      [`${BASE}${A}.mp3`, `${BASE}${B}.mp3`].sort(),
    );
    await clips.use({ baseUrl: BASE, keys: [A, B] });
    expect(fetchClip).toHaveBeenCalledTimes(2); // ya guardados: no se vuelve a pedir
  });

  it('un clip guardado suena sin red', async () => {
    const { clips, fetchClip } = montar();
    await clips.use({ baseUrl: BASE, keys: [A] });
    fetchClip.mockRejectedValue(new Error('sin red'));
    expect(await clips.urlOf(A)).toBe('blob:100');
  });

  it('retira de la caché lo que el snapshot ya no menciona', async () => {
    const { clips, cache } = montar();
    await clips.use({ baseUrl: BASE, keys: [A, B] });
    await clips.use({ baseUrl: BASE, keys: [A] });
    expect([...(cache as ReturnType<typeof cacheEnMemoria>).datos.keys()]).toEqual([
      `${BASE}${A}.mp3`,
    ]);
    expect(clips.has(B)).toBe(false);
  });

  it('un clip que falla al guardar por adelantado se registra y se reintenta al reproducirlo', async () => {
    const fetchClip = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('sin red'));
    fetchClip.mockImplementation(async () => clip());
    const { clips, log } = montar({ fetchClip });
    await clips.use({ baseUrl: BASE, keys: [A] });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Clip ${A} sin guardar: sin red`));
    expect(await clips.urlOf(A)).toBe('blob:100');
  });

  it('rechaza respuestas con error, vacías, enormes o que no son audio', async () => {
    for (const respuesta of [
      new Response('no', { status: 404 }),
      clip(0),
      clip(2 * 1024 * 1024),
      clip(50, 'text/html'),
    ]) {
      const { clips, cache } = montar({ fetchClip: vi.fn(async () => respuesta) as never });
      await clips.use({ baseUrl: BASE, keys: [A] });
      await expect(clips.urlOf(A)).rejects.toThrow();
      expect((cache as ReturnType<typeof cacheEnMemoria>).datos.size).toBe(0);
    }
  });

  it('sin caché del navegador igual suena (no se guarda, solo se descarga)', async () => {
    const { clips, fetchClip } = montar({ cache: null });
    await clips.use({ baseUrl: BASE, keys: [A] });
    expect(await clips.urlOf(A)).toBe('blob:100');
    expect(fetchClip).toHaveBeenCalledTimes(1);
  });

  it('una caché que falla al guardar no impide reproducir', async () => {
    const cache = cacheEnMemoria();
    cache.put = async () => Promise.reject(new Error('cuota'));
    const { clips } = montar({ cache });
    await clips.use({ baseUrl: BASE, keys: [A] });
    expect(await clips.urlOf(A)).toBe('blob:100');
  });

  it('un clip pedido mientras se guarda por adelantado comparte esa descarga', async () => {
    const { clips, fetchClip } = montar();
    const guardando = clips.use({ baseUrl: BASE, keys: [A] });
    const [url] = await Promise.all([clips.urlOf(A), guardando]);
    expect(url).toBe('blob:100');
    expect(fetchClip).toHaveBeenCalledTimes(1);
  });

  it('cambiar de snapshot cambia la dirección de los clips y descarta lo guardado de la anterior', async () => {
    const { clips, cache } = montar();
    await clips.use({ baseUrl: BASE, keys: [A] });
    const OTRA = 'https://cdn.ejemplo.dev/audio/';
    await clips.use({ baseUrl: OTRA, keys: [A] });
    expect([...(cache as ReturnType<typeof cacheEnMemoria>).datos.keys()]).toEqual([
      `${OTRA}${A}.mp3`,
    ]);
  });

  it('ignora claves del snapshot que no son huellas', async () => {
    const { clips, fetchClip } = montar();
    await clips.use({ baseUrl: BASE, keys: ['../../secreto', A] });
    expect(clips.has('../../secreto')).toBe(false);
    expect(fetchClip).toHaveBeenCalledTimes(1);
  });

  it('cada descarga lleva un tiempo máximo y no manda credenciales', async () => {
    const { clips, fetchClip } = montar();
    await clips.use({ baseUrl: BASE, keys: [A] });
    const opciones = fetchClip.mock.calls[0]![1] as RequestInit;
    expect(opciones.credentials).toBe('omit');
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it('rechaza por Content-Length un clip que pasa del tope sin bajarlo', async () => {
    const grande = () =>
      new Response('x', {
        headers: { 'content-length': String(5 * 1024 * 1024), 'content-type': 'audio/mpeg' },
      });
    const { clips } = montar({ fetchClip: vi.fn(async () => grande()) as never });
    await clips.use({ baseUrl: BASE, keys: [A] });
    await expect(clips.urlOf(A)).rejects.toThrow('tamaño');
  });

  it('con ahorro de datos no guarda por adelantado, pero sí al reproducir', async () => {
    const { clips, fetchClip } = montar({ saveData: true });
    await clips.use({ baseUrl: BASE, keys: [A] });
    expect(fetchClip).not.toHaveBeenCalled();
    expect(await clips.urlOf(A)).toBe('blob:100');
    expect(fetchClip).toHaveBeenCalledTimes(1);
  });

  it('un snapshot sin audio vacía la caché y revoca las direcciones creadas', async () => {
    const { clips, cache, revokeUrl } = montar();
    await clips.use({ baseUrl: BASE, keys: [A] });
    await clips.urlOf(A);
    await clips.use(undefined);
    expect((cache as ReturnType<typeof cacheEnMemoria>).datos.size).toBe(0);
    expect(revokeUrl).toHaveBeenCalledWith('blob:100');
    expect(clips.has(A)).toBe(false);
  });

  it('si el snapshot cambia mientras baja un clip, no se queda con su dirección', async () => {
    let soltar!: () => void;
    const lenta = new Promise<void>((r) => (soltar = r));
    const fetchClip = vi.fn(async () => {
      await lenta;
      return clip();
    });
    const { clips, revokeUrl } = montar({ fetchClip: fetchClip as never, saveData: true });
    await clips.use({ baseUrl: BASE, keys: [A] });
    const pedido = clips.urlOf(A);
    const rechazado = expect(pedido).rejects.toThrow('cambió');
    await clips.use({ baseUrl: 'https://cdn.ejemplo.dev/audio/', keys: [B] });
    soltar();
    await rechazado;
    expect(revokeUrl).toHaveBeenCalledWith('blob:100');
  });
});
