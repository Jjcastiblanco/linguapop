---
id: 4
type: epic
title: "APK con voz en un celular real"
parent: initiative-linguapop
covers: ["R2", "R3"]
after: []
refined: false
risk: high
---

# APK con voz en un celular real

## Description

Agrega Capacitor a la app, el adaptador de voz nativo para Android y la compilación del APK de depuración en la integración continua, y lo prueba en un celular real. Se hace temprano porque la voz nativa es el mayor riesgo técnico.

## Outcome

Para el estudiante en Android, LinguaPop se instala como app y las lecciones de escuchar y hablar funcionan o ofrecen una salida sin voz; la señal es una lección completada en un celular real.

## Done when

- El APK de depuración se compila en la integración continua y se descarga.
- El APK se instala y abre en un celular Android real.
- En el celular, "Escuchar" reproduce la voz y "Hablar" reconoce lo dicho.
- Con el micrófono denegado o sin voces, toda lección se completa escribiendo u omitiendo.
- La PWA web sigue funcionando igual.

## Boundaries

La firma de versión pertenece a `epic-endurecer`; cuentas y backend, a `epic-backend-y-cuentas`.

- Touch point: integración continua — se extiende con la compilación del APK; owner: epic-cimientos
- Must not change: las reglas y pantallas de la app web

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R2, R3, R13 (parte APK), C3, C4, C9)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-10, AD-11, AD-14
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, sección 8, fase 3 del plan

## Notes

- Unknown: qué plugin nativo de reconocimiento de voz de Capacitor se usa y si funciona bien en los celulares de prueba; bloquea las historias de voz hasta decidirlo (puede ser un spike).
