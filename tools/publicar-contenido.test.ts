import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CourseSchema, seedCourse, seedPairs, seedReadings } from '../packages/content/src';
// @ts-expect-error módulos .mjs de herramienta, sin tipos
import { cargarFuente } from '../scripts/lib/fuente.mjs';
// @ts-expect-error módulos .mjs de herramienta, sin tipos
import {
  ContenidoInvalido,
  crearBorrador,
  preparar,
  publicar,
  revisar,
} from '../scripts/lib/publicar.mjs';
// @ts-expect-error módulos .mjs de herramienta, sin tipos
import { ApiError, createApi } from '../scripts/lib/supabase-http.mjs';

const RAIZ = join(import.meta.dirname, '..');
const BASE = 'https://proyecto.supabase.co/storage/v1/object/public/audio/';
const MARCA = '2026-11-22T20:00:00.123456+00:00';
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const fuente = () => ({
  course: copia(seedCourse),
  readings: copia(seedReadings),
  pairs: copia(seedPairs),
});
/** Una fuente con un par nuevo (palabras que la semilla no tiene): 10 clips por voz. */
const fuenteConParNuevo = () => {
  const f = fuente();
  f.pairs.push({
    id: 'pair-wolf-woof',
    a: { en: 'wolf', es: 'lobo' },
    b: { en: 'woof', es: 'guau' },
    contrast: 'i-ih',
  });
  return f;
};
const empaquetadas = async () => {
  const { neededAudio } = await import('../packages/content/src');
  return new Set(neededAudio(fuente()).keys());
};

type Estado = {
  role?: string | null;
  names?: string[];
  draft?: Record<string, any> | null;
  published?: Record<string, any> | null;
  publicas?: (clave: string) => boolean;
};
function apiFalsa(estado: Estado = {}) {
  const subidos: string[] = [];
  const rpc = vi.fn(async (nombre: string) =>
    nombre === 'save_content_draft' ? [{ id: 'x', version: 2 }] : 2,
  );
  const api = {
    myRole: async () => (estado.role === undefined ? 'publisher' : estado.role),
    audioNames: async () => new Set(estado.names ?? []),
    uploadAudio: vi.fn(async (clave: string) => {
      subidos.push(clave);
      return 'subido';
    }),
    rpc,
    published: async () => estado.published ?? null,
    draft: async () => estado.draft ?? null,
    audioPublic: async (_b: string, clave: string) => (estado.publicas ?? (() => true))(clave),
    publicBase: () => BASE,
  };
  return { api, subidos, rpc };
}

describe('cargarFuente', () => {
  it('la semilla del repositorio se lee igual que `seedCourse`, en el mismo orden', () => {
    const { course, readings, pairs } = cargarFuente(join(RAIZ, 'packages/content/seed'));
    expect(CourseSchema.parse(course)).toEqual(seedCourse);
    expect(readings).toEqual(seedReadings);
    expect(pairs).toEqual(seedPairs);
  });

  it('rechaza nombres de archivo que salen de la carpeta', () => {
    expect(() => cargarFuente(join(RAIZ, 'tools/no-existe'))).toThrow(/No se pudo leer/);
  });
});

describe('preparar', () => {
  it('la semilla con todo empaquetado valida y no tiene audio remoto', async () => {
    const r = preparar({ fuente: fuente(), bundledKeys: await empaquetadas(), baseUrl: BASE });
    expect(r.problems).toEqual([]);
    expect(r.plan.remote).toEqual([]);
    expect(r.content).not.toHaveProperty('audio');
  });

  it('un par nuevo trae 10 clips remotos por generar, y los ya subidos no se repiten', async () => {
    const bundled = await empaquetadas();
    const a = preparar({ fuente: fuenteConParNuevo(), bundledKeys: bundled, baseUrl: BASE });
    expect(a.plan.remote).toHaveLength(10);
    expect(a.plan.toGenerate).toHaveLength(10);
    const b = preparar({
      fuente: fuenteConParNuevo(),
      bundledKeys: bundled,
      uploadedKeys: new Set(a.plan.remote.slice(0, 4)),
      baseUrl: BASE,
    });
    expect(b.plan.toGenerate).toHaveLength(6);
    expect((b.content as any).audio.keys).toHaveLength(10);
  });

  it('un `audio` escrito a mano en la cabecera del curso no se cuela', async () => {
    const f = fuente() as Record<string, any>;
    f.course.audio = { baseUrl: 'http://malo.test/', keys: ['0123456789abcd'] };
    const r = preparar({ fuente: f, bundledKeys: await empaquetadas(), baseUrl: BASE });
    expect(r.content).not.toHaveProperty('audio');
  });

  it('una clave extra en un ejercicio no llega a lo guardado', async () => {
    const f = fuente() as Record<string, any>;
    f.course.units[0].exercises[0].colado = 'x';
    const r = preparar({ fuente: f, bundledKeys: await empaquetadas(), baseUrl: BASE });
    expect(JSON.stringify(r.content)).not.toContain('colado');
  });

  it('una lectura con palabras sin enseñar se rechaza', async () => {
    const f = fuente();
    f.readings[0]!.lines[0] = 'Hello zebra giraffe okapi';
    const r = preparar({ fuente: f, bundledKeys: await empaquetadas(), baseUrl: BASE });
    expect(r.problems.map((p: { code: string }) => p.code)).toContain('reading-coverage');
  });
});

describe('crearBorrador', () => {
  const opciones = (f: ReturnType<typeof fuente>, bundledKeys: Set<string>) => ({
    fuente: f,
    bundledKeys,
    schemaVersion: 1,
    log: () => undefined,
    generar: vi.fn(async () => Buffer.from('mp3')),
  });

  it('un estudiante no guarda nada', async () => {
    const { api, rpc, subidos } = apiFalsa({ role: 'student' });
    await expect(
      crearBorrador({ api, ...opciones(fuente(), await empaquetadas()) }),
    ).rejects.toThrow(/rol «student»/);
    expect(rpc).not.toHaveBeenCalled();
    expect(subidos).toEqual([]);
  });

  it('con contenido inválido no sube audio ni guarda el borrador', async () => {
    const f = fuenteConParNuevo();
    f.readings[0]!.lines[0] = 'Hello zebra giraffe okapi';
    const { api, rpc, subidos } = apiFalsa({ role: 'author' });
    const o = opciones(f, await empaquetadas());
    await expect(crearBorrador({ api, ...o })).rejects.toBeInstanceOf(ContenidoInvalido);
    expect(o.generar).not.toHaveBeenCalled();
    expect(subidos).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sube solo el audio que falta y guarda el borrador con las claves remotas', async () => {
    const bundled = await empaquetadas();
    const previas = preparar({ fuente: fuenteConParNuevo(), bundledKeys: bundled, baseUrl: BASE });
    const yaSubidas = previas.plan.remote.slice(0, 3);
    const { api, rpc, subidos } = apiFalsa({
      role: 'author',
      names: yaSubidas.map((k: string) => `${k}.mp3`),
    });
    const o = opciones(fuenteConParNuevo(), bundled);
    const r = await crearBorrador({ api, ...o });
    expect(subidos.sort()).toEqual(previas.plan.remote.slice(3).sort());
    expect(rpc).toHaveBeenCalledTimes(1);
    const [nombre, args] = rpc.mock.calls[0] as unknown as [string, any];
    expect(nombre).toBe('save_content_draft');
    expect(args.p_schema_version).toBe(1);
    expect(args.p_content.audio.baseUrl).toBe(BASE);
    expect(args.p_content.audio.keys).toEqual(previas.plan.remote);
    expect(r.version).toBe(2);
    expect(r.changes.join('\n')).toMatch(/Pares nuevos: .*pair-wolf-woof/);
  });

  it('cuenta lo que cambia contra lo ya publicado', async () => {
    const bundled = await empaquetadas();
    const publicado = {
      version: 1,
      content: { ...copia(seedCourse), readings: copia(seedReadings), pairs: copia(seedPairs) },
    };
    const { api } = apiFalsa({ role: 'publisher', published: publicado });
    const f = fuente();
    f.readings[0]!.title = 'Otro título';
    const r = await crearBorrador({ api, ...opciones(f, bundled) });
    expect(r.changes).toEqual([expect.stringMatching(/Lecturas cambiadas: read-saludos-1/)]);
  });
});

describe('revisar y publicar', () => {
  const borrador = async (cambio: (c: Record<string, any>) => void = () => undefined) => {
    const bundled = await empaquetadas();
    const listo = preparar({ fuente: fuenteConParNuevo(), bundledKeys: bundled, baseUrl: BASE });
    const content = copia(listo.content) as Record<string, any>;
    cambio(content);
    return {
      bundled,
      keys: listo.plan.remote as string[],
      draft: { version: 2, content, updated_at: MARCA },
    };
  };

  it('sin borrador no hay nada que revisar', async () => {
    expect(
      await revisar({ api: apiFalsa().api, bundledKeys: new Set(), schemaVersion: 1 }),
    ).toBeNull();
  });

  it('un borrador válido con su audio público no tiene problemas', async () => {
    const { bundled, draft } = await borrador();
    const r = await revisar({
      api: apiFalsa({ draft }).api,
      bundledKeys: bundled,
      schemaVersion: 1,
    });
    expect(r!.problems).toEqual([]);
    expect(r!.version).toBe(2);
    expect(r!.changes.join('\n')).toMatch(/Audio remoto: 10 clips nuevos/);
  });

  it('un clip que no se sirve por la dirección pública se reporta', async () => {
    const { bundled, draft, keys } = await borrador();
    const r = await revisar({
      api: apiFalsa({ draft, publicas: (k) => k !== keys[0] }).api,
      bundledKeys: bundled,
      schemaVersion: 1,
    });
    expect(r!.problems).toEqual([
      expect.objectContaining({ code: 'audio-missing', where: `audio.${keys[0]}` }),
    ]);
  });

  it('un borrador cuya baseUrl no es la de este proyecto se reporta', async () => {
    const { bundled, draft } = await borrador(
      (c) => (c.audio.baseUrl = 'https://otro.ejemplo.dev/audio/'),
    );
    const r = await revisar({
      api: apiFalsa({ draft }).api,
      bundledKeys: bundled,
      schemaVersion: 1,
    });
    expect(r!.problems.map((p: { where: string }) => p.where)).toContain('audio.baseUrl');
  });

  it('se revalida el borrador aunque lo haya escrito otro: una lectura rota se reporta', async () => {
    const { bundled, draft } = await borrador(
      (c) => (c.readings[0].lines[0] = 'Hello zebra giraffe okapi'),
    );
    const r = await revisar({
      api: apiFalsa({ draft }).api,
      bundledKeys: bundled,
      schemaVersion: 1,
    });
    expect(r!.problems.map((p: { code: string }) => p.code)).toContain('reading-coverage');
  });

  it('un autor no publica y un publicador sin --confirmar solo ve qué publicaría', async () => {
    const { bundled, draft } = await borrador();
    await expect(
      publicar({
        api: apiFalsa({ role: 'author', draft }).api,
        bundledKeys: bundled,
        schemaVersion: 1,
        confirmar: true,
        version: 2,
      }),
    ).rejects.toThrow(/rol «author»/);
    const { api, rpc } = apiFalsa({ draft });
    const r = await publicar({ api, bundledKeys: bundled, schemaVersion: 1, confirmar: false });
    expect(r.publicado).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('confirmar exige la versión revisada y publica con la marca de lo revisado', async () => {
    const { bundled, draft } = await borrador();
    const { api, rpc } = apiFalsa({ draft });
    await expect(
      publicar({
        api,
        bundledKeys: bundled,
        schemaVersion: 1,
        confirmar: true,
        version: 7,
        revision: MARCA,
      }),
    ).rejects.toThrow(/versión 2, no la 7/);
    expect(rpc).not.toHaveBeenCalled();
    const r = await publicar({
      api,
      bundledKeys: bundled,
      schemaVersion: 1,
      confirmar: true,
      version: 2,
      revision: MARCA,
    });
    expect(r.publicado).toBe(true);
    expect(rpc).toHaveBeenCalledWith('publish_content', {
      p_schema_version: 1,
      p_version: 2,
      p_updated_at: MARCA,
    });
  });

  it('si el autor reemplaza el borrador después de revisarlo, no se publica', async () => {
    const { bundled, draft } = await borrador();
    const { api, rpc } = apiFalsa({ draft: { ...draft, updated_at: '2026-11-22T21:30:00+00:00' } });
    await expect(
      publicar({
        api,
        bundledKeys: bundled,
        schemaVersion: 1,
        confirmar: true,
        version: 2,
        revision: MARCA,
      }),
    ).rejects.toThrow(/cambió desde que se revisó/);
    await expect(
      publicar({ api, bundledKeys: bundled, schemaVersion: 1, confirmar: true, version: 2 }),
    ).rejects.toThrow(/cambió desde que se revisó/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('un campo que el validador no reconoce en el borrador se reporta y no se publica', async () => {
    const { bundled, draft } = await borrador((c) => (c.colado = { x: 1 }));
    const r = await revisar({
      api: apiFalsa({ draft }).api,
      bundledKeys: bundled,
      schemaVersion: 1,
    });
    expect(r!.problems.map((p: { message: string }) => p.message).join()).toMatch(/no reconoce/);
    const { api, rpc } = apiFalsa({ draft });
    await expect(
      publicar({
        api,
        bundledKeys: bundled,
        schemaVersion: 1,
        confirmar: true,
        version: 2,
        revision: MARCA,
      }),
    ).rejects.toBeInstanceOf(ContenidoInvalido);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('no pide clips a una dirección que no es la de este proyecto', async () => {
    const { bundled, draft } = await borrador(
      (c) => (c.audio.baseUrl = 'https://otro.ejemplo.dev/audio/'),
    );
    const { api } = apiFalsa({ draft });
    const spy = vi.spyOn(api, 'audioPublic');
    await revisar({ api, bundledKeys: bundled, schemaVersion: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('un borrador que sale de la propia herramienta pasa la comparación con lo validado', async () => {
    const { bundled, draft } = await borrador();
    const r = await revisar({
      api: apiFalsa({ draft }).api,
      bundledKeys: bundled,
      schemaVersion: 1,
    });
    expect(r!.problems).toEqual([]);
  });

  it('un borrador inválido no se publica ni confirmando', async () => {
    const { bundled, draft } = await borrador(
      (c) => (c.readings[0].lines[0] = 'Hello zebra giraffe okapi'),
    );
    const { api, rpc } = apiFalsa({ draft });
    await expect(
      publicar({
        api,
        bundledKeys: bundled,
        schemaVersion: 1,
        confirmar: true,
        version: 2,
        revision: MARCA,
      }),
    ).rejects.toBeInstanceOf(ContenidoInvalido);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('cliente HTTP', () => {
  const respuesta = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it('manda la clave anónima y el token de la sesión, y nunca otra clave', async () => {
    const fetchFn = vi.fn(async () => respuesta(200, [{ role: 'author' }]));
    const api = createApi({
      url: 'https://p.supabase.co/',
      anonKey: 'anon',
      token: 'jwt',
      fetchFn,
    });
    expect(await api.myRole()).toBe('author');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.supabase.co/rest/v1/profiles?select=role');
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer jwt' });
  });

  it('un error de la base se convierte en ApiError con su código', async () => {
    const fetchFn = vi.fn(async () =>
      respuesta(403, { message: 'solo un publicador publica', code: '42501' }),
    );
    const api = createApi({ url: 'https://p.supabase.co', anonKey: 'a', token: 't', fetchFn });
    await expect(api.rpc('publish_content', {})).rejects.toMatchObject({
      name: 'Error',
      status: 403,
      code: '42501',
      message: 'solo un publicador publica',
    });
    await expect(api.rpc('publish_content', {})).rejects.toBeInstanceOf(ApiError);
  });

  it('subir un clip que ya existe no es un error', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respuesta(200))
      .mockResolvedValueOnce(
        respuesta(409, { error: 'Duplicate', message: 'The resource already exists' }),
      )
      .mockResolvedValueOnce(
        respuesta(403, { message: 'new row violates row-level security policy' }),
      );
    const api = createApi({ url: 'https://p.supabase.co', anonKey: 'a', token: 't', fetchFn });
    expect(await api.uploadAudio('0123456789abcd', Buffer.from('x'))).toBe('subido');
    expect(await api.uploadAudio('0123456789abcd', Buffer.from('x'))).toBe('existente');
    await expect(api.uploadAudio('0123456789abcd', Buffer.from('x'))).rejects.toThrow(/row-level/);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' });
  });

  it('el acceso con contraseña devuelve un cliente con la sesión', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respuesta(200, { access_token: 'jwt-nuevo' }))
      .mockResolvedValueOnce(respuesta(200, [{ role: 'publisher' }]));
    const api = await createApi({ url: 'https://p.supabase.co', anonKey: 'a', fetchFn }).signIn(
      'a@b.c',
      'x',
    );
    expect(await api.myRole()).toBe('publisher');
    const [, init] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-nuevo' });
  });

  it('lista el bucket por páginas', async () => {
    const pagina = Array.from({ length: 1000 }, (_, i) => ({ name: `a${i}.mp3` }));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respuesta(200, pagina))
      .mockResolvedValueOnce(respuesta(200, [{ name: 'z.mp3' }]));
    const api = createApi({ url: 'https://p.supabase.co', anonKey: 'a', token: 't', fetchFn });
    expect((await api.audioNames()).size).toBe(1001);
  });
});
