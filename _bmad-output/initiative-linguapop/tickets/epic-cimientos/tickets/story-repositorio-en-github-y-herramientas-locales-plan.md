---
title: 'Repositorio en GitHub y herramientas locales'
type: 'chore'
ticket: '1'
created: '2026-10-25'
status: 'built'
baseline_revision: 'NO_VCS'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'none'
review_source: 'auto'
lenses_ran: []
review_loop_iteration: 0
context:
  - '_bmad-output/initiative-linguapop/tickets/epic-cimientos/epic-cimientos.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** el proyecto no era un repositorio git, no tenía fijada la versión de Node que piden Capacitor 8 y Vite (22 o superior) y no existía el repositorio público donde construir LinguaPop.

**Approach:** fijar Node 24 LTS y pnpm como herramientas del proyecto, iniciar git con la rama `main`, crear el repositorio público `linguapop` con un primer commit de la app y la planificación, y proteger la rama principal para que todo cambio entre por pull request.

</frozen-after-approval>

## Implementation Notes

Ruta de un solo paso: es una tarea de entorno y de servicios externos, sin código de producto. Decisiones: repositorio `linguapop`, público; primer commit con `linguapop.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `_bmad-output/` y `docs/`; carpetas de herramientas de agentes fuera del repositorio mediante `.gitignore`; el historial usa solo correos noreply de GitHub.

Hecho: Node 24 LTS fijado en `.nvmrc`; pnpm 10; repositorio público `linguapop` con rama `main`; rama `main` protegida (pull request obligatorio, también para administradores, sin force push ni borrado, sin aprobaciones mínimas). La protección aún no exige la comprobación de CI porque no existe hasta la historia 1.4.

## Verification

**Commands:**
- `node -v && pnpm -v` -- expected: `v24.x` y una versión de pnpm
- `gh repo view linguapop --json visibility,defaultBranchRef` -- expected: público, rama `main`
- `gh api repos/OWNER/linguapop/branches/main/protection` -- expected: protección activa con pull request obligatorio

**Resultado:** Node 24, pnpm 10, repositorio `PUBLIC` con rama `main` y protección activa verificados.
