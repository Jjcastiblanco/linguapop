---
id: 3
type: epic
title: "App web con paridad funcional"
parent: initiative-linguapop
covers: ["R1", "R4"]
after: []
refined: false
risk: medium
---

# App web con paridad funcional

## Description

Construye la app React con las pantallas aprender, practicar, ligas (simulada en local), perfil, lección y llamada con Nova, los adaptadores web (voz con Web Speech API, sonido, reloj y almacenamiento local), la raíz de composición y una PWA con contenido semilla que funciona sin conexión. No usa backend.

## Outcome

Para el estudiante, la app nueva en el navegador hace todo lo que hace `linguapop.html`; la señal es una revisión de paridad pantalla por pantalla aprobada.

## Done when

- Un estudiante completa las 15 lecciones y obtiene XP, racha, gemas, metas, logros y cofres como en `linguapop.html`.
- Repaso de errores, práctica personalizada, desafío cronometrado, prueba de nivel y protector de racha funcionan igual.
- La llamada con Nova funciona en voz o en texto, con 5 temas, repetición lenta, pista, resumen y desbloqueo al terminar Saludos.
- La PWA se instala y abre sin conexión con el contenido semilla.
- La revisión de paridad contra `linguapop.html` está firmada y la app se despliega en staging.

## Boundaries

El APK pertenece a `epic-android-temprano`; cuentas y progreso remoto, a `epic-backend-y-cuentas`; la liga real, a `epic-liga-real`; la conversación libre con IA, a `epic-endurecer`.

- Touch point: dominio y contenido — se consumen, no se modifican; owner: epic-dominio-y-contenido
- Must not change: textos y reglas de `linguapop.html` hasta aprobar la paridad

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R1, R4, C2, C7, C8)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-10, AD-11, AD-12
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, secciones 3 y 5, fase 2 del plan
