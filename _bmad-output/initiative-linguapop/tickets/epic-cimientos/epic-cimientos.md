---
id: 1
type: epic
title: "Cimientos del monorepo y la entrega"
parent: initiative-linguapop
covers: ["R13"]
after: []
refined: true
risk: low
---

# Cimientos del monorepo y la entrega

## Description

Crea el monorepo pnpm sobre Node 24 con los paquetes `domain` y `content` y las apps `app` y `admin` vacías, la regla de imports que protege el dominio, la integración continua en GitHub Actions que prueba y compila la web, el despliegue automático de la web de staging y los tres entornos de Supabase (local, staging y producción).

## Outcome

Para quien construye LinguaPop, hay una base de repositorio y de entrega reproducible donde cada cambio se prueba y se despliega; la señal es una integración continua en verde y la web de staging pública.

## Requirements

- R1 (parent R13): el monorepo se instala y compila desde cero con Node 24 y pnpm.
- R2 (parent R13, AD-1): una regla automática hace fallar la integración continua si `packages/domain` importa React, el DOM, Capacitor, Supabase o algo de `apps/`.
- R3 (parent R13, AD-16): la integración continua corre en cada cambio y bloquea la fusión si falla.
- R4 (parent R13, AD-14): la web de staging se publica sola desde la rama principal y es pública.
- R5 (parent R13, AD-14): existen el entorno local de Supabase con la CLI y los proyectos gratuitos de staging y producción, con una migración vacía aplicada desde el repositorio.

## Constraints

- C1 (parent C1): solo planes gratuitos (GitHub Actions, Cloudflare Pages, Supabase).
- C2 (parent C2): el dominio no importa React, DOM ni SDK, y las apps no se importan entre sí.
- C3 (parent C3): React 19, Vite, TypeScript 6, Node 24 LTS y pnpm; versiones exactas confirmadas al crear el proyecto.
- C4 (parent C4): ninguna clave secreta en el repositorio; solo la URL y la clave anónima de Supabase son públicas.
- C8 (parent C8): `linguapop.html` sigue funcionando sin cambios hasta alcanzar paridad.
- C9 (parent C9): el Node del usuario es 20.19.5; hay que subirlo a Node 24.

## Done when

- El monorepo instala y compila desde cero con Node 24 y pnpm.
- Una regla automática hace fallar la integración continua si `packages/domain` importa React, el DOM, Capacitor, Supabase o algo de `apps/`.
- La integración continua corre en cada cambio y bloquea la fusión si falla.
- La web de staging se publica sola desde la rama principal y se abre en el navegador.
- Existen el entorno local de Supabase con la CLI y los proyectos gratuitos de staging y producción, con una migración vacía aplicada.

## Boundaries

Contenido, reglas y pantallas pertenecen a `epic-dominio-y-contenido` y `epic-app-web`; el APK, a `epic-android-temprano`.

- Touch point: Supabase — aquí solo se crean los proyectos y el entorno local; el esquema real llega después; owner: epic-backend-y-cuentas
- Must not change: `linguapop.html` sigue funcionando

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R13, C2, C3, C9)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-1, AD-2, AD-14, AD-16
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, sección 7 (entornos) y fase 0 del plan

## Notes

- Decision: 2026-10-25 — el monorepo vive en esta misma carpeta, que se inicia como repositorio git y se conecta a GitHub.
- Decision: 2026-10-25 — la web se hospeda en Cloudflare Pages, que separa staging y producción por rama; GitHub Pages da un solo sitio por repositorio.
- Decision: 2026-10-25 — ESLint con `no-restricted-imports` protege el dominio, Prettier da formato y Vitest corre las pruebas.
- Decision: 2026-10-25 — `linguapop.html` (con su `sw.js`, manifest e íconos) se copia sin cambios a `legacy/` y se sirve en staging hasta alcanzar paridad.
- Decision: 2026-10-25 — rama principal protegida: todo cambio entra por pull request y la integración continua es obligatoria.
- Decision: 2026-10-25 — el repositorio es público: la CI no tiene tope de minutos y los exportes ya se cifran antes de subirse.
- Decision: 2026-10-25 — la compilación del APK queda para `epic-android-temprano`; esta épica deja la CI lista para extenderla.
- Decision: 2026-10-25 — bala trazadora: repositorio, monorepo, regla de imports, integración continua y web de staging (historias 1 a 5) recorren todo el camino de entrega con una página base.
