---
id: 6
type: epic
title: "Panel de administración y publicación"
parent: initiative-linguapop
covers: ["R5", "R6"]
after: []
refined: false
risk: medium
---

# Panel de administración y publicación

## Description

Construye el panel para que un autor edite unidades, ejercicios, diálogos y logros en borrador con validación y vista previa, y un publicador publique versiones inmutables que mueven el puntero `latest`.

## Outcome

Para quien mantiene el contenido, los cambios llegan a las apps sin reinstalar; la señal es un cambio publicado que un celular ya instalado muestra en su siguiente apertura.

## Done when

- Un autor crea y edita ejercicios y diálogos en borrador, los valida y los previsualiza con el mismo motor de lección.
- Un publicador publica y se crea una versión inmutable; volver a una versión anterior es mover el puntero.
- Un celular ya instalado muestra el cambio en su siguiente apertura sin reinstalar.
- Un autor no puede publicar, un estudiante no puede escribir y el contenido inválido no se publica, con pruebas que lo demuestran.
- El panel está desplegado en staging y producción.

## Boundaries

Cuentas, roles base y lectura de contenido remoto pertenecen a `epic-backend-y-cuentas`.

- Touch point: motor de lección — se reutiliza para la vista previa; owner: epic-dominio-y-contenido
- Must not change: los snapshots ya publicados (son inmutables)

## References

- parent — _bmad-output/initiative-linguapop/initiative-linguapop.md, sección Requirements (R5, R6, C6)
- architecture — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md, reglas AD-3, AD-4, AD-5, AD-8
- design — _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md, secciones 4 y 5, fase 5 del plan
