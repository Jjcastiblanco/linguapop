---
id: 8
type: epic
title: "Continuidad, APK firmado y Nova con IA opcional"
parent: initiative-linguapop
covers: ["R14", "R4"]
after: []
refined: false
risk: medium
---

# Continuidad, APK firmado y Nova con IA opcional

## Description

Deja la plataforma lista para producción gratuita: ping programado contra la pausa del plan gratis, exportes cifrados de la base de datos con una restauración probada, el APK de versión firmado y la conversación libre con IA de Nova a través de una función del servidor.

## Outcome

Para quien opera LinguaPop, la plataforma sigue viva, se puede restaurar y se puede instalar firmada; la señal es una restauración probada y un APK de versión instalado.

## Done when

- El ping programado mantiene activo el proyecto de Supabase y hay evidencia de ejecuciones periódicas.
- Los exportes cifrados se generan de forma periódica y se hizo una restauración de prueba.
- El APK de versión firmado se compila desde una etiqueta y se instala en un celular.
- La conversación libre con IA de Nova pasa por una función del servidor con límite por usuario y ninguna clave llega al cliente.

## Boundaries

El APK de depuración pertenece a `epic-android-temprano`; el esquema y los permisos, a `epic-backend-y-cuentas`.

- Touch point: integración continua — se añaden flujos programados y de firma; owner: epic-cimientos
- Must not change: el árbol de diálogo sigue siendo el modo por defecto de Nova

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R14, R4 (IA opcional), C1, C4, C9)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-9, AD-14
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, sección 7, fase 7 del plan

## Notes

- Open question: quién será el primer autor y publicador, solo el usuario o un equipo (afecta a quién se entrega el panel y los permisos).
