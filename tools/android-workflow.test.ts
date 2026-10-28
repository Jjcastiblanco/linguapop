import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Paso = {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
  'working-directory'?: string;
};
type Trabajo = {
  'runs-on': string;
  needs?: string;
  if?: string;
  permissions?: Record<string, string>;
  steps: Paso[];
};
type Flujo = {
  on: {
    push: { branches: string[] };
    pull_request: { paths: string[] };
    workflow_dispatch: unknown;
  };
  permissions: Record<string, string>;
  concurrency: { group: string; 'cancel-in-progress': string };
  jobs: { build: Trabajo; publish: Trabajo };
};

const ruta = resolve(process.cwd(), '.github/workflows/android.yml');
const texto = readFileSync(ruta, 'utf8');
const flujo = load(texto) as Flujo;
const gradle = readFileSync(resolve(process.cwd(), 'apps/app/android/app/build.gradle'), 'utf8');
const pasos = (t: Trabajo) => t.steps.map((p) => `${p.name ?? ''} ${p.uses ?? ''} ${p.run ?? ''}`);

describe('flujo android.yml (AD-21, AD-22, AD-23)', () => {
  it('compila en cada push a main, en los PR que tocan la app y a mano', () => {
    expect(flujo.on.push.branches).toEqual(['main']);
    expect(flujo.on.pull_request.paths).toEqual(
      expect.arrayContaining([
        'apps/app/**',
        'packages/**',
        'pnpm-lock.yaml',
        'package.json',
        '.github/workflows/android.yml',
      ]),
    );
    expect(flujo.on).toHaveProperty('workflow_dispatch');
  });

  it('usa un servidor fijo y Java 21 elegido con setup-java', () => {
    const { build } = flujo.jobs;
    expect(build['runs-on']).toBe('ubuntu-24.04');
    expect(flujo.jobs.publish['runs-on']).toBe('ubuntu-24.04');
    const java = build.steps.find((p) => p.uses?.startsWith('actions/setup-java@'));
    expect(java?.with).toMatchObject({ distribution: 'temurin', 'java-version': '21' });
  });

  it('sincroniza Capacitor, exige el árbol limpio y compila con el wrapper del proyecto', () => {
    const todo = pasos(flujo.jobs.build).join('\n');
    expect(todo).toContain('pnpm --filter @linguapop/app cap:sync');
    expect(todo).toContain('git status --porcelain apps/app/android');
    const gradlew = flujo.jobs.build.steps.find((p) => p.run?.includes('./gradlew assembleDebug'));
    expect(gradlew?.['working-directory']).toBe('apps/app/android');
    expect(todo).not.toMatch(/(^|\s)gradle assemble/);
  });

  it('en main las publicaciones esperan en cola y en PR se cancelan las viejas', () => {
    expect(flujo.concurrency.group).toContain('github.ref');
    expect(flujo.concurrency['cancel-in-progress']).toContain("github.ref != 'refs/heads/main'");
  });

  it('da permisos mínimos: solo publicar escribe', () => {
    expect(flujo.permissions).toEqual({ contents: 'read' });
    expect(flujo.jobs.build.permissions).toBeUndefined();
    expect(flujo.jobs.publish.permissions).toEqual({ contents: 'write' });
  });

  it('los secretos solo se leen en un push y son los cuatro de la clave de depuración', () => {
    const usos = [...texto.matchAll(/\$\{\{[^}]*secrets\.([A-Z0-9_]+)[^}]*\}\}/g)];
    expect(usos.length).toBeGreaterThan(0);
    for (const uso of usos) expect(uso[0]).toContain("github.event_name == 'push'");
    expect(new Set(usos.map((u) => u[1]))).toEqual(
      new Set([
        'ANDROID_DEBUG_KEYSTORE_BASE64',
        'ANDROID_DEBUG_KEYSTORE_PASSWORD',
        'ANDROID_DEBUG_KEY_ALIAS',
        'ANDROID_DEBUG_KEY_PASSWORD',
      ]),
    );
  });

  it('sin el secreto avisa de cuál falta y firma con la clave temporal', () => {
    const paso = flujo.jobs.build.steps.find((p) => p.name === 'Preparar la clave de depuración');
    expect(paso?.run).toContain('::warning::Falta el secreto ANDROID_DEBUG_KEYSTORE_BASE64');
    expect(paso?.run).toContain('firma=clave temporal');
    expect(paso?.run).toContain('firma=clave estable');
  });

  it('el versionName lleva el SHA y el APK se verifica antes de publicarse', () => {
    const version = flujo.jobs.build.steps.find((p) => p.run?.includes('corto='));
    expect(version?.run).toContain('-debug-${corto}');
    const compilar = flujo.jobs.build.steps.find((p) => p.run?.includes('./gradlew'));
    expect(compilar?.env).toMatchObject({
      APP_VERSION_NAME: '${{ steps.version.outputs.nombre }}',
      APP_VERSION_CODE: '${{ github.run_number }}',
    });
    const comprobar = flujo.jobs.build.steps.find((p) => p.name === 'Comprobar el APK');
    expect(comprobar?.run).toContain('aapt2');
    expect(comprobar?.run).toMatch(/apksigner"?\s+verify/);
    expect(comprobar?.run).toContain('exit 1');
  });

  it('solo main publica: mueve la etiqueta y reemplaza el APK con un nombre fijo', () => {
    const { publish } = flujo.jobs;
    expect(publish.needs).toBe('build');
    expect(publish.if).toContain("github.event_name != 'pull_request'");
    expect(publish.if).toContain("github.ref == 'refs/heads/main'");
    const todo = pasos(publish).join('\n');
    expect(todo).toContain('git tag -f android-debug');
    expect(todo).toContain('git push -f origin android-debug');
    expect(todo).toContain('gh release upload android-debug salida/linguapop-debug.apk --clobber');
    expect(todo).toContain('--prerelease');
    expect(flujo.jobs.build.steps.some((p) => p.uses?.startsWith('actions/upload-artifact@'))).toBe(
      true,
    );
  });
});

describe('build.gradle del proyecto Android (AD-21)', () => {
  it('firma con la clave de depuración solo si el CI la entrega', () => {
    expect(gradle).toMatch(/signingConfigs\s*\{\s*debug\s*\{/);
    for (const variable of [
      'DEBUG_KEYSTORE_FILE',
      'DEBUG_KEYSTORE_PASSWORD',
      'DEBUG_KEY_ALIAS',
      'DEBUG_KEY_PASSWORD',
    ])
      expect(gradle).toContain(`System.getenv('${variable}')`);
    expect(gradle).toMatch(/if\s*\(keystore\)/);
    expect(gradle).toMatch(/debug\s*\{\s*signingConfig signingConfigs\.debug/);
  });

  it('toma la versión del entorno y deja valores por defecto en local', () => {
    // Con paréntesis tras `versionCode`, Groovy lo lee como una llamada a método y falla con "Value is null".
    expect(gradle).toContain(
      "versionCode Integer.parseInt(System.getenv('APP_VERSION_CODE') ?: '1')",
    );
    expect(gradle).toContain("System.getenv('APP_VERSION_NAME') ?: '1.0'");
  });
});
