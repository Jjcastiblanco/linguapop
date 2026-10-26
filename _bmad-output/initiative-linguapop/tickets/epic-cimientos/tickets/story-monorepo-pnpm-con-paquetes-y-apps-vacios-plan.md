---
title: 'Monorepo pnpm con paquetes y apps vacíos'
type: 'chore'
ticket: '2'
created: '2026-10-25'
status: 'built'
baseline_revision: '5285d97'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'none'
review_source: 'auto'
lenses_ran: []
review_loop_iteration: 0
context:
  - '_bmad-output/initiative-linguapop/tickets/epic-cimientos/epic-cimientos.md'
  - '_bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** el repositorio solo contiene la PWA heredada y la planificación; no hay un espacio de trabajo donde construir el dominio, el contenido ni las apps.

**Approach:** crear un monorepo pnpm con `packages/domain`, `packages/content`, `apps/app` y `apps/admin` mínimos, TypeScript estricto, Prettier y Vitest con una prueba mínima, de modo que instalar, compilar y probar funcione desde un clon limpio con Node 24.

</frozen-after-approval>

## Implementation Notes

Ruta de un solo paso: andamiaje sin lógica de producto. Versiones confirmadas con `npm view` al crear: Vite 8.3.5, `@vitejs/plugin-react` 6.1.2, React 19.3.1, TypeScript 6.0.3 (typescript-eslint acepta TypeScript menor que 6.1, así que no se usa la 7), Vitest 5.0.5 (la arquitectura decía 4.1.x; ya existe la 5 estable y se actualiza la línea), Prettier 3.9.10.

Decisiones: los paquetes `domain` y `content` no incluyen la librería DOM ni tipos de plataforma, así el sistema de tipos ayuda a mantener el dominio puro (AD-1); las apps dependen de los paquetes por `workspace:*`; `linguapop.html` y sus archivos quedan fuera del formato de Prettier.

## Verification

**Commands:**
- `pnpm install && pnpm -r build && pnpm test` desde un clon limpio -- expected: termina sin errores con Node 24
- `pnpm format:check` -- expected: sin diferencias de formato

**Resultado:** con Node 24 y pnpm 10, `pnpm install`, `pnpm -r build` (4 proyectos), `pnpm test` (2 pruebas) y `pnpm format:check` terminan sin errores. La arquitectura se actualizó: Vitest 5.x y TypeScript 6.0.x.
