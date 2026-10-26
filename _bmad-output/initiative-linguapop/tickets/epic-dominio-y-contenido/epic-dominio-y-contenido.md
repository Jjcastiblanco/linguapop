---
id: 2
type: epic
title: "Dominio y contenido con pruebas"
parent: initiative-linguapop
covers: ["R12"]
after: []
refined: false
risk: medium
---

# Dominio y contenido con pruebas

## Description

Extrae una sola vez los arreglos `UNITS`, `TOPICS` y `ACHIEVEMENTS` de `linguapop.html` a JSON validado por los esquemas Zod de `packages/content`, y lleva a `packages/domain` la comparación de texto, la puntuación, la racha, el pliegue de eventos y los motores puros de lección y de llamada, con los puertos declarados y pruebas Vitest.

## Outcome

Para quien mantiene las reglas del juego, estas viven en un paquete puro y probado y el contenido es dato validado; la señal es que todo el contenido semilla valida y las pruebas del dominio pasan en la integración continua.

## Done when

- Todo el contenido semilla (5 unidades de 20 ejercicios, 5 temas de Nova y los logros) valida contra los esquemas, y un ejercicio inválido hace fallar la integración continua.
- Las pruebas del dominio cubren comparación de texto, racha con protector, puntuación y los dos motores, con los casos de referencia de `linguapop.html`.
- El motor de lección completa una lección simulada de punta a punta emitiendo eventos.
- Los resultados de referencia (comparación de texto y XP de una lección) coinciden con los de `linguapop.html`.

## Boundaries

Las pantallas y los adaptadores pertenecen a `epic-app-web`; la sincronización y el servidor, a `epic-backend-y-cuentas`.

- Must not change: el vocabulario A1–A2, los 10 ejercicios por lección y el cálculo de XP actuales

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R12, R1 (reglas), R4 (motor de llamada), C2, C6)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-1, AD-3, AD-6, AD-12, AD-13, AD-16
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, secciones 3 y 5, fase 1 del plan
