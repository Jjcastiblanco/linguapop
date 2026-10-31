import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { seedCourse } from '@linguapop/content';
import { composeWithContent } from '.';
import { createNativeComposition } from './native';
import { CONTENT_CACHE_KEY } from './adapters/cached-content';
import { memoria, nuevoId } from '../test/helpers';

const publicado = (version: number) => {
  const content = JSON.parse(JSON.stringify(seedCourse)) as Record<string, unknown>;
  content.level = `A1-A2 v${version}`;
  return { version, content };
};

describe('arranque con contenido publicado', () => {
  it('sin caché usa la semilla, no espera a la red y deja el snapshot para el próximo arranque', async () => {
    const m = memoria();
    let responder!: (s: ReturnType<typeof publicado>) => void;
    const latest = vi.fn(() => new Promise<ReturnType<typeof publicado>>((r) => (responder = r)));
    const c = await composeWithContent(undefined, {
      storage: m.storage,
      newId: nuevoId,
      contentRemote: { available: () => true, latest },
    });
    expect(c.course).toBe(seedCourse);
    expect(c.contentVersion).toBe(0);
    expect(latest).toHaveBeenCalledWith(1);
    responder(publicado(2));
    await vi.waitFor(() => expect(m.data.has(CONTENT_CACHE_KEY)).toBe(true));

    const siguiente = await composeWithContent(undefined, {
      storage: m.storage,
      contentRemote: { available: () => false, latest: async () => null },
    });
    expect(siguiente.course.level).toBe('A1-A2 v2');
    expect(siguiente.contentVersion).toBe(2);
    expect(await siguiente.content.load()).toBe(siguiente.course);
  });
});

describe('entrar con Google según la plataforma', () => {
  const entorno = () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://prueba.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-anonima');
  };
  const sinRed = { available: () => false, latest: async () => null };

  it('la web lo ofrece cuando hay Supabase configurado', async () => {
    entorno();
    const c = await composeWithContent(undefined, {
      storage: memoria().storage,
      contentRemote: sinRed,
    });
    expect(c.auth.googleAvailable()).toBe(true);
    vi.unstubAllEnvs();
  });

  it('el APK no lo ofrece, aunque haya Supabase configurado', async () => {
    entorno();
    const c = await composeWithContent(createNativeComposition, {
      storage: memoria().storage,
      contentRemote: sinRed,
      googleSignIn: false,
    });
    expect(c.auth.available()).toBe(true);
    expect(c.auth.googleAvailable()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('el APK lo ofrece con el selector nativo cuando se le da uno', async () => {
    entorno();
    const c = await composeWithContent(createNativeComposition, {
      storage: memoria().storage,
      contentRemote: sinRed,
      googleSignIn: false,
      nativeGoogle: async () => ({ kind: 'cancelled' }),
    });
    expect(c.auth.googleAvailable()).toBe(true);
    expect(await c.auth.signInWithGoogle()).toEqual({ kind: 'cancelled' });
    vi.unstubAllEnvs();
  });

  it('el punto de entrada del APK usa el selector nativo y no la redirección web', () => {
    const entrada = readFileSync(new URL('../main.native.tsx', import.meta.url), 'utf8');
    expect(entrada).toMatch(/googleSignIn: false/);
    expect(entrada).toMatch(/VITE_GOOGLE_WEB_CLIENT_ID/);
  });

  it('sin Supabase no hay cuentas ni Google', async () => {
    const c = await composeWithContent(undefined, {
      storage: memoria().storage,
      contentRemote: sinRed,
    });
    expect(c.auth.googleAvailable()).toBe(false);
  });
});
