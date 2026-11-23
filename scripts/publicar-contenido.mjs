// Publica contenido (épica 13, 13.6): valida, genera el audio que falta, lo sube, guarda un borrador y,
// con la cuenta de un publicador, lo publica como versión nueva sin liberar la app.
//
//   pnpm contenido copiar <carpeta>            copia la semilla para editarla sin tocar el repositorio
//   pnpm contenido validar [--dir <carpeta>]   valida y cuenta el audio por generar (sin red)
//   pnpm contenido borrador [--dir <carpeta>]  genera y sube el audio y guarda el borrador (autor o publicador)
//   pnpm contenido revisar                     vuelve a validar el borrador y dice qué cambia (autor o publicador)
//   pnpm contenido publicar --version <n> --revision <huella> --confirmar
//                                              publica el borrador revisado (solo publicador); `revisar` imprime la huella
//
// Sin `--dir` usa la semilla del repositorio. Necesita SUPABASE_URL y SUPABASE_ANON_KEY y la sesión de
// una cuenta con rol: LINGUAPOP_ACCESS_TOKEN (la sesión de la app; el acceso con contraseña no sirve
// donde el captcha está activo) o LINGUAPOP_EMAIL y LINGUAPOP_PASSWORD. Nunca usa claves de servicio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarFuente, copiarSemilla } from './lib/fuente.mjs';
import { ContenidoInvalido, crearBorrador, preparar, publicar, revisar } from './lib/publicar.mjs';
import { createApi } from './lib/supabase-http.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semilla = path.join(raiz, 'packages/content/seed');
const SCHEMA_VERSION = 1;

const [comando, ...resto] = process.argv.slice(2);
const opcion = (nombre) => {
  const i = resto.indexOf(`--${nombre}`);
  return i > -1 ? resto[i + 1] : undefined;
};
const dir = path.resolve(opcion('dir') ?? semilla);
const bundledKeys = new Set(
  JSON.parse(fs.readFileSync(path.join(raiz, 'apps/app/public/audio/manifest.json'), 'utf8')).keys,
);
const log = (m) => console.log(m);

function lista(titulo, lineas) {
  console.log(
    lineas.length ? `${titulo}\n${lineas.map((l) => `  · ${l}`).join('\n')}` : `${titulo} ninguno`,
  );
}

async function conectar() {
  const url = process.env.SUPABASE_URL ?? '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !anonKey) {
    throw new Error('Faltan SUPABASE_URL (https://<proyecto>.supabase.co) y SUPABASE_ANON_KEY.');
  }
  const token = process.env.LINGUAPOP_ACCESS_TOKEN;
  const anonimo = createApi({ url, anonKey });
  if (token) return createApi({ url, anonKey, token });
  const { LINGUAPOP_EMAIL: email, LINGUAPOP_PASSWORD: clave } = process.env;
  if (!email || !clave) {
    throw new Error(
      'Falta la sesión: LINGUAPOP_ACCESS_TOKEN o LINGUAPOP_EMAIL y LINGUAPOP_PASSWORD.',
    );
  }
  return anonimo.signIn(email, clave);
}

try {
  switch (comando) {
    case 'copiar': {
      const destino = path.resolve(resto[0] ?? '');
      if (!resto[0]) throw new Error('Indica la carpeta de destino.');
      copiarSemilla(semilla, destino);
      console.log(`Semilla copiada a ${destino}. Edítala y usa --dir ${destino}.`);
      break;
    }
    case 'validar': {
      const listo = preparar({
        fuente: cargarFuente(dir),
        bundledKeys,
        baseUrl: 'https://proyecto.supabase.co/storage/v1/object/public/audio/',
      });
      if (listo.problems.length > 0) throw new ContenidoInvalido(listo.problems);
      console.log(
        `Contenido válido. Audio: ${listo.plan.bundled.length} empaquetados, ${listo.plan.remote.length} remotos (por generar o ya subidos).`,
      );
      break;
    }
    case 'borrador': {
      const api = await conectar();
      const { loadSynthesizer } = await import('./lib/kokoro.mjs');
      let sintetizar;
      const resultado = await crearBorrador({
        api,
        fuente: cargarFuente(dir),
        bundledKeys,
        schemaVersion: SCHEMA_VERSION,
        log,
        generar: async (texto) => (sintetizar ??= await loadSynthesizer())(texto),
      });
      console.log(`Borrador guardado: versión ${resultado.version}.`);
      lista('Cambios respecto de lo publicado:', resultado.changes);
      console.log('Siguiente: pnpm contenido revisar');
      break;
    }
    case 'revisar': {
      const revision = await revisar({
        api: await conectar(),
        bundledKeys,
        schemaVersion: SCHEMA_VERSION,
      });
      if (!revision) {
        console.log('No hay un borrador abierto.');
        break;
      }
      console.log(`Borrador versión ${revision.version} (guardado ${revision.updatedAt}).`);
      lista('Cambios respecto de lo publicado:', revision.changes);
      if (revision.problems.length > 0) throw new ContenidoInvalido(revision.problems);
      console.log(
        `Válido. Para publicarlo: pnpm contenido publicar --version ${revision.version} --confirmar`,
      );
      break;
    }
    case 'publicar': {
      const resultado = await publicar({
        api: await conectar(),
        bundledKeys,
        schemaVersion: SCHEMA_VERSION,
        confirmar: resto.includes('--confirmar'),
        version: opcion('version') === undefined ? undefined : Number(opcion('version')),
        revision: opcion('revision'),
      });
      lista('Cambios respecto de lo publicado:', resultado.changes);
      console.log(
        resultado.publicado
          ? `Publicado: versión ${resultado.version}. Las apps la verán en su siguiente apertura.`
          : `Sin publicar. Para hacerlo: pnpm contenido publicar --version ${resultado.version} --revision ${resultado.updatedAt} --confirmar`,
      );
      break;
    }
    default:
      console.log(
        fs
          .readFileSync(fileURLToPath(import.meta.url), 'utf8')
          .split('\n')
          .slice(0, 10)
          .join('\n'),
      );
      process.exitCode = comando ? 2 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
