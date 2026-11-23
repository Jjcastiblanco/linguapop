// Deja que Node cargue el código TypeScript del repositorio tal cual (AD-1: el contenido no depende
// de nada del entorno): sus importaciones relativas no llevan extensión, y Node exige una.
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith('.') &&
    !/\.[a-z]+$/i.test(specifier) &&
    !context.parentURL?.includes('/node_modules/')
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      /* no era un archivo .ts: se resuelve como siempre */
    }
  }
  return nextResolve(specifier, context);
}
