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
legacy/             # copia sin cambios de la versión heredada (PWA de un solo archivo)
linguapop.html      # versión heredada original, se retira al alcanzar paridad
```

## Staging

Cada cambio que entra a `main` publica la web (`apps/app`) en Cloudflare Pages, en el proyecto `linguapop-staging`, mediante `.github/workflows/staging.yml`. Necesita dos secretos del repositorio en GitHub: `CLOUDFLARE_API_TOKEN` (permiso _Cloudflare Pages: Edit_) y `CLOUDFLARE_ACCOUNT_ID`. Sin ellos el flujo avisa y no despliega.

La app es una PWA instalable que abre sin conexión (`vite-plugin-pwa`, configurada en `apps/app/vite.config.ts`). Su service worker nunca atiende `/legacy/`: la navegación la excluye y nada de `legacy/` se precachea, y una prueba lo comprueba sobre el build real.

La web de staging también sirve la versión heredada en `/legacy/` (se abre en `/legacy/linguapop.html`) hasta que la app nueva alcance paridad.

## Supabase

Entornos: local (CLI de Supabase con Docker), `staging` y `production` (dos proyectos gratuitos). El esquema vive en `supabase/migrations/`; no se edita desde el panel.

```bash
pnpm db:start   # levanta Supabase en local (requiere Docker en ejecución)
pnpm db:reset   # recrea la base local aplicando todas las migraciones
pnpm db:stop
```

`.github/workflows/migraciones.yml` aplica las migraciones a `staging` en cada cambio de `main`, y a `production` solo a mano. Cada entorno de GitHub (`staging` y `production`) necesita los secretos `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` y la variable `SUPABASE_PROJECT_REF` (identificador del proyecto). Sin ellos el flujo avisa y no aplica nada.
