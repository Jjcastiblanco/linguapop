# LinguaPop

App para aprender inglés (interfaz en español, nivel A1–A2) con lecciones gamificadas, repaso de errores y llamadas con Nova. Se publica como PWA y como APK de Android.

## Requisitos de desarrollo

- Node 24 LTS (la versión está en `.nvmrc`)
- pnpm 10

## Comandos

```bash
pnpm install        # instala las dependencias del monorepo
pnpm -r build       # compila todos los paquetes y apps
pnpm lint           # revisa las reglas de frontera entre capas (ESLint)
pnpm test           # corre las pruebas (Vitest)
pnpm format:check   # revisa el formato (Prettier)
```

## Estructura

```text
packages/domain/    # reglas del juego en TypeScript puro
packages/content/   # esquemas y contenido
apps/app/           # app React (web y Android)
apps/admin/         # panel de administración de contenido
linguapop.html      # versión heredada, se retira al alcanzar paridad
```
