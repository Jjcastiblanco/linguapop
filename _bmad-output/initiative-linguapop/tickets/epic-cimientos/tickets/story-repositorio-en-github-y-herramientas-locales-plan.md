---
title: 'Repositorio en GitHub y herramientas locales'
type: 'chore'
ticket: '1'
created: '2026-10-25'
status: 'in-progress'
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

**Problem:** el proyecto no es un repositorio git, Node es 20.19.5 (Capacitor 8 y Vite piden 22 o superior) y no existe el repositorio público donde construir LinguaPop.

**Approach:** subir Node a 24 con nvm, iniciar git con la rama `main`, crear el repositorio público `Jjcastiblanco/linguapop` con un primer commit de la app y la planificación, y proteger la rama principal para que todo cambio entre por pull request.

</frozen-after-approval>

## Implementation Notes

Ruta de un solo paso: es una tarea de entorno y de servicios externos, sin código de producto. Decisiones del usuario (2026-10-25): repositorio `linguapop`, público; primer commit con `linguapop.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `_bmad-output/` y `docs/`; carpetas de herramientas fuera del repositorio; commits con el correo noreply de GitHub; autorizó crear el repositorio, subir y proteger la rama.

## Verification

**Commands:**
- `bash -lc 'node -v && pnpm -v'` -- expected: `v24.x` y una versión de pnpm
- `gh repo view Jjcastiblanco/linguapop --json visibility,defaultBranchRef` -- expected: público, rama `main`
- `gh api repos/Jjcastiblanco/linguapop/branches/main/protection` -- expected: protección activa con pull request obligatorio
