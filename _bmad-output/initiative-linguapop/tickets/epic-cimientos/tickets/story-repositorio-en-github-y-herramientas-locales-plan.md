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

**Problem:** el proyecto no es un repositorio git, Node es 20.19.5 (Capacitor 8 y Vite piden 22 o superior) y no existe el repositorio público donde construir LinguaPop.

**Approach:** subir Node a 24 con nvm, iniciar git con la rama `main`, crear el repositorio público `Jjcastiblanco/linguapop` con un primer commit de la app y la planificación, y proteger la rama principal para que todo cambio entre por pull request.

</frozen-after-approval>

## Implementation Notes

Ruta de un solo paso: es una tarea de entorno y de servicios externos, sin código de producto. Decisiones del usuario (2026-10-25): repositorio `linguapop`, público; primer commit con `linguapop.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `_bmad-output/` y `docs/`; carpetas de herramientas fuera del repositorio; commits con el correo noreply de GitHub; autorizó crear el repositorio, subir y proteger la rama.

Hecho: Node 24.22.1 instalado con nvm y fijado como predeterminado (`.nvmrc` con 24); pnpm 10.34.9 bajo Node 24; git iniciado en `main` con correo noreply (`33246337+Jjcastiblanco@users.noreply.github.com`) solo en este repositorio; primer commit `a280faea21e4d9c6b266ca4c45d65f4547c80ba3`; repositorio público https://github.com/Jjcastiblanco/linguapop; rama `main` protegida (pull request obligatorio, también para administradores, sin force push ni borrado, sin aprobaciones mínimas porque trabaja una sola persona).
Sorpresas: la primera instalación de Node 24 se cortó por tiempo y se repitió en segundo plano; los comandos instalados globalmente bajo Node 20 (por ejemplo n8n y qwen-code) ya no están en el PATH del Node predeterminado: `nvm use 20` los recupera. La protección aún no exige la comprobación de CI porque no existe hasta la historia 1.4.

## Verification

**Commands:**
- `bash -lc 'node -v && pnpm -v'` -- expected: `v24.x` y una versión de pnpm
- `gh repo view Jjcastiblanco/linguapop --json visibility,defaultBranchRef` -- expected: público, rama `main`
- `gh api repos/Jjcastiblanco/linguapop/branches/main/protection` -- expected: protección activa con pull request obligatorio

**Resultado (2026-10-25):** `node -v` en un shell nuevo da `v24.22.1`; `pnpm -v` da `10.34.9`; `gh repo view` muestra el repositorio `PUBLIC` con rama `main`; la API de ramas confirma `protected: true`.
