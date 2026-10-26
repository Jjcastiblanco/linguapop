---
id: 5
type: epic
title: "Backend, cuentas y sincronización"
parent: initiative-linguapop
covers: ["R7", "R8", "R9", "R11"]
after: []
refined: false
risk: high
---

# Backend, cuentas y sincronización

## Description

Crea las migraciones de Supabase, el login con correo y Google, los permisos por fila, el progreso como eventos idempotentes con cola de envío, la lectura de contenido remoto con caché, la importación del progreso heredado de `localStorage` y el borrado de cuenta.

## Outcome

Para una persona con cuenta, su progreso es el mismo en cualquier dispositivo y no se pierde sin conexión; la señal es el mismo progreso en dos dispositivos.

## Done when

- Las migraciones versionadas crean perfiles, eventos de progreso, contenido y la base de la liga, y se aplican desde el repositorio.
- Una persona inicia sesión con correo y con Google en dos dispositivos y ve el mismo progreso.
- El progreso hecho sin red se sincroniza al volver y reenviar el mismo evento no duplica XP.
- El progreso heredado de `localStorage` se importa como eventos marcados `legacy` en el primer inicio de sesión.
- Una prueba demuestra que un estudiante no puede leer los eventos de otro, y borrar la cuenta elimina sus datos.

## Boundaries

El panel de escritura de contenido pertenece a `epic-administracion`; la liga, a `epic-liga-real`.

- Touch point: Supabase — este épico es dueño de su esquema y permisos; owner: epic-backend-y-cuentas
- Must not change: el comportamiento local de la app en modo invitado

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R7, R8, R9, R11, C4, C5)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-5, AD-6, AD-7, AD-8, AD-9, AD-13, AD-15
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, secciones 4, 5 y 6, fase 4 del plan
