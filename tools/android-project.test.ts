import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = resolve(process.cwd(), 'apps/app');
const leer = (ruta: string) => readFileSync(resolve(app, ruta), 'utf8');
const ejecutar = (orden: string) =>
  execSync(orden, { cwd: app, env: { ...process.env, CI: 'true' }, stdio: 'pipe' });

describe('proyecto Android (AD-16, AD-18, AD-24)', () => {
  it('la configuración de Capacitor fija el appId, el origen y la carpeta web', async () => {
    const { default: config } = await import('../apps/app/capacitor.config');
    expect(config).toMatchObject({
      appId: 'app.linguapop.mobile',
      appName: 'LinguaPop',
      webDir: 'dist-native',
      server: { androidScheme: 'https' },
    });
  });

  it('el APK declara minSdk 33 y compila contra el SDK 36', () => {
    const variables = leer('android/variables.gradle');
    expect(variables).toMatch(/minSdkVersion\s*=\s*33\b/);
    expect(variables).toMatch(/compileSdkVersion\s*=\s*36\b/);
    expect(variables).toMatch(/targetSdkVersion\s*=\s*36\b/);
  });

  it('el proyecto usa el mismo identificador que la configuración', () => {
    expect(leer('android/app/build.gradle')).toContain('app.linguapop.mobile');
  });

  it('el manifest declara el micrófono y la visibilidad de los servicios de voz', () => {
    const manifest = leer('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    expect(manifest).toMatch(
      /<queries>[\s\S]*android\.speech\.RecognitionService[\s\S]*<\/queries>/,
    );
    expect(manifest).toMatch(
      /<queries>[\s\S]*android\.intent\.action\.TTS_SERVICE[\s\S]*<\/queries>/,
    );
  });

  it('las tres piezas de Capacitor están fijadas a la misma versión exacta', () => {
    const pkg = JSON.parse(leer('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const versiones = [
      pkg.dependencies['@capacitor/core'],
      pkg.dependencies['@capacitor/android'],
      pkg.devDependencies['@capacitor/cli'],
    ];
    expect(new Set(versiones).size).toBe(1);
    expect(versiones[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('se ignora lo que regenera cap sync y se versiona lo que Capacitor pide versionar', () => {
    const ignorado = (f: string) => {
      try {
        execSync(`git check-ignore -q ${f}`, { cwd: app });
        return true;
      } catch {
        return false;
      }
    };
    expect(ignorado('android/app/src/main/assets/public/index.html')).toBe(true);
    expect(ignorado('android/app/src/main/assets/capacitor.config.json')).toBe(true);
    expect(ignorado('android/app/build/outputs/apk/debug/app-debug.apk')).toBe(true);
    expect(ignorado('android/capacitor.settings.gradle')).toBe(false);
    expect(ignorado('android/app/capacitor.build.gradle')).toBe(false);
    expect(ignorado('android/app/src/main/AndroidManifest.xml')).toBe(false);
  });

  it('cap sync copia la app nativa y no cambia ningún archivo versionado', () => {
    const versionados = ['android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle'];
    ejecutar('pnpm run build:native');
    ejecutar('pnpm exec cap sync android');
    const antes = versionados.map(leer);

    ejecutar('pnpm exec cap sync android');
    expect(versionados.map(leer)).toEqual(antes);

    const publico = 'android/app/src/main/assets/public';
    expect(existsSync(resolve(app, publico, 'index.html'))).toBe(true);
    expect(existsSync(resolve(app, publico, 'sw.js'))).toBe(false);
    expect(existsSync(resolve(app, publico, 'manifest.webmanifest'))).toBe(false);
    expect(JSON.parse(leer('android/app/src/main/assets/capacitor.config.json'))).toMatchObject({
      appId: 'app.linguapop.mobile',
      server: { androidScheme: 'https' },
    });
  }, 180_000);
});
