---
type: initiative
title: LinguaPop
parent: none
sources:
  - linguapop.html
  - _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md
  - _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md
companions:
  - _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md
  - _bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md
after: []
risk: high
---

# LinguaPop

## Description

LinguaPop es hoy una PWA de aprendizaje de inglés en un solo archivo (`linguapop.html`), con el contenido en arreglos del código, el estado en `localStorage`, sin cuentas y con una liga simulada. Esta iniciativa la convierte en una plataforma: una app React que se instala como APK y como PWA, con contenido editable desde un panel sin reinstalar, cuentas con progreso sincronizado entre dispositivos y una liga con usuarios reales, todo con planes gratuitos. La arquitectura y el plan por fases ya están decididos y viven en los companions.

## Outcome

Para estudiantes hispanohablantes de inglés A1–A2 y para quien mantiene el contenido, LinguaPop deja de ser un archivo único y pasa a ser una app instalable con cuentas, liga real y contenido que se edita sin reinstalar; la señal es el recorrido completo de *Done when*.

## Requirements

- R1 (linguapop.html): un estudiante puede hacer en la app nueva todo lo que hoy hace `linguapop.html`: camino de 5 unidades con lecciones de 10 ejercicios de 6 tipos, XP, racha, gemas, metas diarias, logros, cofre por unidad, repaso de errores, práctica personalizada, desafío cronometrado, prueba de nivel, protector de racha mensual, perfil con gráfico de 7 días y modo oscuro.
- R2 (diseno-solucion 1): la app se instala como APK en un celular Android y como PWA, con la misma funcionalidad, y en el celular se completa una lección con ejercicios de escuchar y hablar.
- R3 (AD-11): todo ejercicio de voz tiene una salida sin voz; sin micrófono, reconocimiento o voces el estudiante completa el ejercicio escribiendo u omitiendo.
- R4 (linguapop.html, AD-9): las llamadas con Nova (voz o texto, 5 temas de al menos 8 turnos, repetición lenta y pista, resumen al colgar, desbloqueo al terminar Saludos) funcionan en web y Android; la conversación libre con IA es opcional, pasa por el servidor y ninguna clave llega al cliente.
- R5 (AD-3, AD-4, AD-5): un autor crea y edita unidades, ejercicios, diálogos y logros en un panel y los previsualiza; un publicador los publica; un celular ya instalado muestra el cambio en su siguiente apertura sin reinstalar; el contenido inválido no se puede publicar.
- R6 (AD-8): solo un publicador publica, un autor solo escribe borradores y un estudiante solo lee contenido publicado y su propio progreso.
- R7 (AD-6, AD-8): una persona crea cuenta (correo y contraseña o Google), inicia sesión en dos dispositivos y ve el mismo progreso.
- R8 (AD-5, AD-6): la app abre y permite estudiar sin conexión (contenido semilla en el primer uso, último contenido descargado después) y el progreso hecho sin red se sincroniza al volver sin duplicar XP.
- R9 (AD-15): el progreso guardado en `localStorage` por `linguapop.html` se conserva al iniciar sesión por primera vez.
- R10 (AD-7, AD-8): cada semana el estudiante aparece en una tabla con otros usuarios reales (completada con bots marcados como bots); el XP semanal lo calcula el servidor con un tope y nunca se muestra correo ni datos privados de otros.
- R11 (AD-8): una persona puede borrar su cuenta y sus datos.
- R12 (AD-16): las reglas del juego (comparación de texto, racha, puntuación, motores de lección y llamada) tienen pruebas automáticas, el contenido semilla se valida en cada cambio y un cambio que falle no se fusiona.
- R13 (AD-14): la web y el APK se compilan y publican desde integración continua sin pasos manuales, y los cambios de esquema de la base de datos se aplican desde migraciones del repositorio.
- R14 (AD-14): la plataforma funciona con planes gratuitos; el proyecto de Supabase no se pausa por inactividad y existen exportes cifrados periódicos de la base de datos.

## Constraints

- C1 (usuario): presupuesto cero; solo planes gratuitos.
- C2 (AD-1, AD-2): el dominio es TypeScript puro sin React, DOM ni SDK, y las apps no se importan entre sí.
- C3 (Stack): React 19, Vite, TypeScript 6, Capacitor 8, Node 24 LTS, pnpm y Supabase; las versiones exactas se confirman al crear el proyecto.
- C4 (AD-9): ningún secreto en la web ni en el APK; solo la URL de Supabase y la clave anónima pública.
- C5 (AD-6, AD-7): el progreso son eventos idempotentes local-primero; el servidor deriva el XP semanal y la liga.
- C6 (AD-3, AD-4): el contenido tiene un solo esquema, versiones inmutables y evoluciona solo de forma aditiva.
- C7 (linguapop.html): la interfaz está en español y se enseña inglés A1–A2; la marca LinguaPop, el zorro y Nova son originales.
- C8 (AD-15): la migración es estrangulada; `linguapop.html` sigue funcional hasta alcanzar paridad.
- C9 (diseno-solucion 7): el Node del usuario es 20.19.5 y Capacitor 8 pide 22 o superior; no hay Android SDK local, así que el APK sale de GitHub Actions.

## Done when

- Un estudiante instala el APK de versión en un celular Android, crea cuenta, completa una lección con escuchar y hablar, y su XP aparece en la liga semanal.
- Un publicador publica un cambio en una unidad y un celular ya instalado lo muestra sin reinstalar.
- Dos dispositivos con la misma cuenta ven el mismo progreso, y el progreso hecho sin red se sincroniza sin duplicar XP.
- La integración continua está en verde: pruebas del dominio, validación del contenido semilla, compilación de la web y del APK.
- Los exportes cifrados y el ping de actividad están activos y se hizo un ejercicio de restauración de respaldo.
- `linguapop.html` está retirado después de verificar la paridad con la app nueva.

## Boundaries

Fuera de esta iniciativa: compilación para iOS, publicación en Google Play, cobro del plan PRO, analítica, notificaciones push, moderación de nombres visibles, elección del proveedor de modelo de lenguaje y antifraude más fuerte que el tope de XP. El contenido y las reglas actuales (vocabulario A1–A2, 10 ejercicios por lección, cálculo de XP) se trasladan sin rediseñarlos.

- Touch point: Supabase (Auth, Postgres, Realtime, Edge Functions) — servicio externo que se usa, no se construye; owner: epic-backend-y-cuentas
- Touch point: GitHub Actions y hosting de la web (Cloudflare Pages o GitHub Pages) — se configuran, no se construyen; owner: epic-cimientos
- Must not change: el contenido y las reglas de `linguapop.html` hasta que la app nueva alcance paridad
- Tracer path: contenido semilla en el dominio, luego app web, luego un APK con voz, y después cuentas, administración y liga.

## References

- architecture — `_bmad-output/initiative-linguapop/architecture-linguapop-plataforma/architecture-linguapop-plataforma.md`, reglas AD-1 a AD-16
- design — `_bmad-output/initiative-linguapop/architecture-linguapop-plataforma/diseno-solucion-linguapop.md`, secciones 4, 5 y 8 (modelo de datos, flujos y fases)
- source — `linguapop.html`, comportamiento actual que se conserva

## Notes

- Assumption: se permite usar la app como invitado, con eventos solo locales, y se suben al iniciar sesión.
- Assumption: la administración usa los roles estudiante, autor y publicador con borrador y publicación versionada.
- Open question: ¿quién será el primer autor y publicador, solo el usuario o un equipo?
- Open question: ¿cuántas personas reales se esperan en la liga al inicio? Define el tamaño de cohorte y la cantidad de bots.
- Decision: 2026-10-25 — la iniciativa se corta en 8 épicas, una por fase del plan de migración, en el orden del plan.
- Decision: 2026-10-25 — la épica de dominio y contenido se mantiene separada; se rechazó fundirla con la app web aunque no llega a producción por sí sola.
- Decision: 2026-10-25 — la primera demo es el APK con voz en un celular real, antes del backend, por ser lo más incierto.
- Decision: 2026-10-25 — R13 queda en la épica de cimientos (la parte del APK se extiende en la de Android) y R4 en la app web (la IA opcional se añade en la de endurecer).
