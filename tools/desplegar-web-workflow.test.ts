import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Paso = { name?: string; env?: Record<string, string>; run?: string; if?: string };
type Trabajo = {
  name?: string;
  environment?: string;
  if?: string;
  uses?: string;
  with?: Record<string, string>;
  secrets?: string;
  steps?: Paso[];
};
type Flujo = {
  on: Record<string, unknown>;
  concurrency?: { group: string };
  jobs: Record<string, Trabajo>;
};

const leer = (nombre: string) => {
  const texto = readFileSync(resolve(process.cwd(), '.github/workflows', nombre), 'utf8');
  return { texto, flujo: load(texto) as Flujo };
};

describe('despliegue de la web (staging y producción)', () => {
  const reusable = leer('desplegar-web.yml');
  const staging = leer('staging.yml');
  const produccion = leer('produccion.yml');

  it('staging se publica en cada push a main con su proyecto y su entorno', () => {
    expect(staging.flujo.on).toHaveProperty('push');
    expect(staging.flujo.jobs.deploy).toMatchObject({
      uses: './.github/workflows/desplegar-web.yml',
      with: { entorno: 'staging', proyecto: 'linguapop-staging' },
      secrets: 'inherit',
    });
  });

  it('producción solo se publica a mano, desde main, con el entorno production', () => {
    expect(Object.keys(produccion.flujo.on)).toEqual(['workflow_dispatch']);
    const trabajo = produccion.flujo.jobs.deploy!;
    expect(trabajo.if).toBe("github.ref == 'refs/heads/main'");
    expect(trabajo.with).toMatchObject({ entorno: 'production' });
    expect(trabajo.uses).toBe('./.github/workflows/desplegar-web.yml');
    expect(produccion.flujo.concurrency?.group).toBe('produccion');
  });

  it('el flujo reutilizable toma el entorno del parámetro, que es lo que activa la aprobación', () => {
    expect(reusable.flujo.jobs.deploy!.environment).toBe('${{ inputs.entorno }}');
  });

  it('comprueba que SUPABASE_URL es la base del entorno antes de construir', () => {
    const pasos = reusable.flujo.jobs.deploy!.steps!;
    const guardia = pasos.findIndex((p) => p.name?.startsWith('Comprobar que la web apunta'));
    const construir = pasos.findIndex((p) => p.run?.includes('@linguapop/app build'));
    expect(guardia).toBeGreaterThan(-1);
    expect(guardia).toBeLessThan(construir);
    expect(pasos[guardia]!.run).toContain('https://$SUPABASE_PROJECT_REF.supabase.co');
    expect(pasos[guardia]!.run).toContain('exit 1');
  });

  it('la construcción lee la base, la clave y Turnstile de las variables, no de secretos', () => {
    const construir = reusable.flujo.jobs.deploy!.steps!.find((p) =>
      p.run?.includes('@linguapop/app build'),
    )!;
    expect(construir.env).toEqual({
      VITE_SUPABASE_URL: '${{ vars.SUPABASE_URL }}',
      VITE_SUPABASE_ANON_KEY: '${{ vars.SUPABASE_ANON_KEY }}',
      VITE_TURNSTILE_SITE_KEY: '${{ vars.TURNSTILE_SITE_KEY }}',
    });
  });

  it('las credenciales de Cloudflare solo llegan a los pasos que hablan con Cloudflare', () => {
    for (const paso of reusable.flujo.jobs.deploy!.steps!) {
      const conSecretos = Object.values(paso.env ?? {}).some((v) => String(v).includes('secrets.'));
      const habla = /cloudflare|wrangler|credenciales/i.test(`${paso.name} ${paso.run}`);
      if (conSecretos) expect(habla, paso.name).toBe(true);
    }
    expect(reusable.texto).not.toMatch(/service_role|SERVICE_ROLE|SUPABASE_SERVICE|sb_secret_/);
  });

  it('el nombre del proyecto nunca se interpola en el guion: va por variable de entorno y se valida', () => {
    expect(reusable.texto).not.toMatch(/run:[^\n]*\$\{\{\s*inputs\./);
    expect(reusable.texto).toContain("grep -Eq '^[a-z0-9][a-z0-9-]{0,56}$'");
  });

  it('el APK de depuración lee las variables del entorno staging', () => {
    const android = leer('android.yml');
    expect(android.flujo.jobs.build!.environment).toBe('staging');
  });
});
