import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function reglasQueFallan(code: string, archivo: string) {
  const [resultado] = await eslint.lintText(code, { filePath: resolve(archivo) });
  return (resultado?.messages ?? []).map((m) => m.ruleId);
}

const DOMINIO = 'packages/domain/src/ejemplo.ts';
const CONTENIDO = 'packages/content/src/ejemplo.ts';
const APP = 'apps/app/src/ejemplo.ts';
const ADMIN = 'apps/admin/src/ejemplo.ts';

describe('frontera del dominio y del contenido', () => {
  it.each([
    ["import { useState } from 'react';", 'React'],
    ["import type { FC } from 'react';", 'React (solo tipos)'],
    ["import { createRoot } from 'react-dom/client';", 'React DOM'],
    ["import { Capacitor } from '@capacitor/core';", 'Capacitor'],
    ["import { createClient } from '@supabase/supabase-js';", 'Supabase'],
    ["import { x } from '../../../apps/app/src/main';", 'ruta hacia apps/'],
    ["import { x } from '@linguapop/app';", 'paquete de la app'],
  ])('el dominio no puede importar %s', async (codigo) => {
    expect(await reglasQueFallan(codigo, DOMINIO)).toContain('no-restricted-imports');
  });

  it('el dominio no puede hacer import dinámico de React', async () => {
    expect(await reglasQueFallan("const cargar = () => import('react');", DOMINIO)).toContain(
      'no-restricted-syntax',
    );
  });

  it('el dominio no puede usar el DOM', async () => {
    expect(await reglasQueFallan('export const t = window.document;', DOMINIO)).toContain(
      'no-restricted-globals',
    );
  });

  it('el dominio sí puede importar contenido y archivos propios', async () => {
    const codigo =
      "import { PACKAGE_NAME } from '@linguapop/content';\nimport { a } from './otro';\n";
    expect(await reglasQueFallan(codigo, DOMINIO)).toEqual([]);
  });

  it('el contenido no puede importar el dominio ni React', async () => {
    expect(await reglasQueFallan("import { x } from '@linguapop/domain';", CONTENIDO)).toContain(
      'no-restricted-imports',
    );
    expect(await reglasQueFallan("import { y } from 'react';", CONTENIDO)).toContain(
      'no-restricted-imports',
    );
  });
});

describe('las apps no se importan entre sí', () => {
  it.each([
    ["import { x } from '@linguapop/admin';"],
    ["import { x } from '../../admin/src/main';"],
    ["import { x } from '../../../apps/admin/src/main';"],
  ])('la app no puede importar %s', async (codigo) => {
    expect(await reglasQueFallan(codigo, APP)).toContain('no-restricted-imports');
  });

  it.each([["import { x } from '@linguapop/app';"], ["import { x } from '../../app/src/main';"]])(
    'el panel no puede importar %s',
    async (codigo) => {
      expect(await reglasQueFallan(codigo, ADMIN)).toContain('no-restricted-imports');
    },
  );

  it('las apps sí pueden usar React y los paquetes compartidos', async () => {
    const codigo =
      "import { useState } from 'react';\nimport { PACKAGE_NAME } from '@linguapop/domain';\nconsole.log(window.document);\n";
    expect(await reglasQueFallan(codigo, APP)).toEqual([]);
    expect(await reglasQueFallan(codigo, ADMIN)).toEqual([]);
  });
});

describe('Capacitor solo en el código nativo (AD-19)', () => {
  const FUERA = 'apps/app/src/screens/ejemplo.ts';
  const NATIVO = 'apps/app/src/composition/native/ejemplo.ts';
  const ARRANQUE = 'apps/app/src/main.native.tsx';

  it.each([
    ["import { Capacitor } from '@capacitor/core';"],
    ["import { TextToSpeech } from '@capacitor-community/text-to-speech';"],
    ["import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';"],
  ])('la app no puede importar %s fuera del código nativo', async (codigo) => {
    expect(await reglasQueFallan(codigo, FUERA)).toContain('no-restricted-imports');
    expect(await reglasQueFallan(codigo, APP)).toContain('no-restricted-imports');
  });

  it('la app no puede hacer import dinámico de Capacitor fuera del código nativo', async () => {
    expect(await reglasQueFallan("const c = () => import('@capacitor/core');", FUERA)).toContain(
      'no-restricted-syntax',
    );
  });

  it.each([[NATIVO], [ARRANQUE]])('sí puede importarlo %s', async (archivo) => {
    const codigo =
      "import { Capacitor } from '@capacitor/core';\nimport { TextToSpeech } from '@capacitor-community/text-to-speech';\nexport const c = Capacitor;\n";
    expect(await reglasQueFallan(codigo, archivo)).toEqual([]);
    expect(
      await reglasQueFallan("export const c = () => import('@capacitor/core');", archivo),
    ).toEqual([]);
  });

  it('el archivo de configuración de Capacitor sí puede importar su tipo', async () => {
    expect(
      await reglasQueFallan(
        "import type { CapacitorConfig } from '@capacitor/cli';\nexport const c: CapacitorConfig = {};\n",
        'apps/app/capacitor.config.ts',
      ),
    ).toEqual([]);
  });

  it('el código nativo sigue sin poder importar el panel', async () => {
    expect(await reglasQueFallan("import { x } from '@linguapop/admin';", NATIVO)).toContain(
      'no-restricted-imports',
    );
  });
});
