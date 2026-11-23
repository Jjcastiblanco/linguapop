// Flujo de la herramienta de publicación (épica 13, historia 13.6). Todo lo que toca la red o el
// disco entra por parámetros, así se prueba sin base de datos. Nada aquí se salta el servidor: quien
// puede guardar o publicar lo decide el rol de la cuenta (13.8); la herramienta solo evita pedir
// lo que sabe que fallará y, sobre todo, no deja pasar contenido que el validador rechaza.
import {
  buildContent,
  neededAudio,
  planAudio,
  stableStringify,
  summarizeChange,
} from '../../packages/content/src/publish.ts';
import { validateContent } from '../../packages/content/src/validate.ts';

export class ContenidoInvalido extends Error {
  constructor(problems) {
    super(
      `El contenido no pasa la validación (${problems.length}):\n${problems
        .map((p) => `  - ${p.where}: ${p.message}`)
        .join('\n')}`,
    );
    this.problems = problems;
  }
}

const SIN_EXTENSION = (nombre) => nombre.replace(/\.mp3$/, '');

/** Arma el contenido a publicar y lo valida; no toca la red. */
export function preparar({ fuente, bundledKeys, uploadedKeys = new Set(), baseUrl }) {
  const needed = neededAudio(fuente);
  const plan = planAudio(needed, bundledKeys, uploadedKeys);
  const audio = { baseUrl, keys: plan.remote };
  // La comprobación de audio de aquí vale por construcción (todo lo necesario está empaquetado o en
  // el plan): la que de verdad lo comprueba es `revisar`, que mira el bucket.
  const result = validateContent(
    { course: fuente.course, readings: fuente.readings, pairs: fuente.pairs, audio },
    { audioKeys: new Set(needed.keys()) },
  );
  // Se guarda lo validado (datos ya parseados, sin campos desconocidos), no el JSON crudo.
  const content = result.ok ? buildContent(result.content, result.content.audio ?? null) : null;
  return { needed, plan, content, problems: result.ok ? [] : result.problems };
}

async function exigirRol(api, permitidos) {
  const role = await api.myRole();
  if (!permitidos.includes(role)) {
    throw new Error(
      `Tu cuenta tiene el rol «${role ?? 'sin perfil'}»; hace falta ${permitidos.join(' o ')}.`,
    );
  }
  return role;
}

/** Valida, genera y sube el audio que falta y guarda el borrador. Con contenido inválido no cambia nada. */
export async function crearBorrador({ api, fuente, bundledKeys, generar, schemaVersion, log }) {
  await exigirRol(api, ['author', 'publisher']);
  const subidas = new Set([...(await api.audioNames())].map(SIN_EXTENSION));
  const listo = preparar({ fuente, bundledKeys, uploadedKeys: subidas, baseUrl: api.publicBase() });
  if (listo.problems.length > 0) throw new ContenidoInvalido(listo.problems);

  const { toGenerate } = listo.plan;
  log(`${listo.plan.remote.length} clips remotos, ${toGenerate.length} por generar y subir`);
  let n = 0;
  for (const clave of toGenerate) {
    const resultado = await api.uploadAudio(clave, await generar(listo.needed.get(clave)));
    n += 1;
    if (n % 10 === 0 || n === toGenerate.length) log(`  ${n}/${toGenerate.length} (${resultado})`);
  }

  const [guardado] = await api.rpc('save_content_draft', {
    p_schema_version: schemaVersion,
    p_content: listo.content,
  });
  const publicado = await api.published(schemaVersion);
  return {
    version: guardado.version,
    changes: summarizeChange(publicado?.content, listo.content),
  };
}

/** Lee el borrador abierto y lo vuelve a validar tal como lo vería la app; comprueba que el audio exista. */
export async function revisar({ api, bundledKeys, schemaVersion, concurrency = 8 }) {
  const draft = await api.draft(schemaVersion);
  if (!draft) return null;
  const content = draft.content;
  const audio = content.audio;
  const audioKeys = new Set([...bundledKeys, ...(audio?.keys ?? [])]);
  const result = validateContent(
    { course: content, readings: content.readings, pairs: content.pairs, audio },
    { audioKeys },
  );
  const problems = result.ok ? [] : [...result.problems];
  if (result.ok) {
    // Lo guardado debe ser exactamente lo validado: un campo que el validador no reconoce no se publica.
    const esperado = buildContent(result.content, result.content.audio ?? null);
    if (stableStringify(esperado) !== stableStringify(content)) {
      problems.push({
        code: 'course-schema',
        where: '(raíz)',
        message: 'el borrador trae campos que el validador no reconoce o difiere de lo validado',
      });
    }
  }
  if (audio) {
    const propia = audio.baseUrl === api.publicBase();
    if (!propia) {
      problems.push({
        code: 'audio-schema',
        where: 'audio.baseUrl',
        message: `no es la dirección pública de este proyecto (${api.publicBase()})`,
      });
    }
    const faltan = [];
    const cola = [...audio.keys];
    // Solo se piden clips a la dirección de este proyecto, nunca a la que escriba un borrador ajeno.
    if (!propia) cola.length = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        for (let clave = cola.shift(); clave; clave = cola.shift()) {
          if (!(await api.audioPublic(audio.baseUrl, clave).catch(() => false))) faltan.push(clave);
        }
      }),
    );
    for (const clave of faltan.sort()) {
      problems.push({
        code: 'audio-missing',
        where: `audio.${clave}`,
        message: 'el clip no se sirve desde el bucket público',
      });
    }
  }
  const publicado = await api.published(schemaVersion);
  return {
    version: draft.version,
    updatedAt: draft.updated_at,
    problems,
    changes: summarizeChange(publicado?.content, content),
  };
}

/** Publica el borrador revisado. Sin `confirmar` solo muestra qué se publicaría. */
export async function publicar({
  api,
  bundledKeys,
  schemaVersion,
  confirmar,
  version,
  revision: huella,
}) {
  await exigirRol(api, ['publisher']);
  const revision = await revisar({ api, bundledKeys, schemaVersion });
  if (!revision) throw new Error('No hay un borrador para publicar.');
  if (revision.problems.length > 0) throw new ContenidoInvalido(revision.problems);
  if (!confirmar) return { ...revision, publicado: false };
  if (version !== revision.version) {
    throw new Error(
      `El borrador es la versión ${revision.version}, no la ${version ?? '(sin indicar)'}: revisa y confirma con --version ${revision.version}.`,
    );
  }
  // La huella es la que imprimió `revisar`: si el autor reemplazó el borrador después, ya no coincide
  // y no se publica algo que quien publica no vio.
  if (huella !== revision.updatedAt) {
    throw new Error(
      'El borrador cambió desde que se revisó (o falta --revision). Vuelve a correr `pnpm contenido revisar`.',
    );
  }
  await api.rpc('publish_content', {
    p_schema_version: schemaVersion,
    p_version: revision.version,
    p_updated_at: revision.updatedAt,
  });
  return { ...revision, publicado: true };
}
