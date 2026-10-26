---
id: 7
type: epic
title: "Liga con usuarios reales"
parent: initiative-linguapop
covers: ["R10"]
after: []
refined: false
risk: medium
---

# Liga con usuarios reales

## Description

Implementa las cohortes semanales, los bots marcados, la función que valida el tope de XP, la vista de liga sin datos privados y la actualización en tiempo real, para reemplazar la liga simulada.

## Outcome

Para el estudiante, la liga semanal compara su XP con el de personas reales; la señal es que dos usuarios reales aparecen en la misma tabla.

## Done when

- Una función rechaza los eventos que superan el tope de XP y el cliente los excluye de su estado.
- Cada semana (UTC, de lunes a lunes) se forman cohortes de hasta 30 completadas con bots marcados como bots.
- Dos usuarios reales aparecen en la misma tabla semanal con XP calculado por el servidor.
- La vista de liga no expone correo ni eventos de otros usuarios.
- La tabla se actualiza en tiempo real en la app.

## Boundaries

Los eventos de progreso y las cuentas pertenecen a `epic-backend-y-cuentas`.

- Touch point: eventos de progreso — se leen para derivar el XP semanal; owner: epic-backend-y-cuentas
- Must not change: el significado del XP de una lección

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R10, C5)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-7, AD-8, AD-13
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, secciones 4 y 5, fase 6 del plan

## Notes

- Open question: cuántas personas reales se esperan al inicio; define el tamaño de cohorte y la cantidad de bots.
