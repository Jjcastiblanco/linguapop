# Revisión adversarial (secuencial, mismo contexto)

Pares de unidades que cumplen cada AD al pie de la letra y aun así divergen:

1. Semana de liga: el servidor usa semana UTC; un cliente que calcula "XP semanal" con eventos locales usa semana local. -> cerrar: el cliente no calcula semana ni posiciones (AD-7).
2. Logros: el panel crea un logro con una condición que el dominio no implementa. -> cerrar: condiciones como enumeración cerrada en el dominio; el esquema rechaza tipos desconocidos (AD-3).
3. Racha y protector: un constructor modela el consumo del protector como evento y otro como derivación. -> cerrar: siempre derivación del pliegue (AD-6).
4. Versiones de evento: APK viejo envía lesson_completed@1 y el servidor solo acepta @2. -> cerrar: política de compatibilidad (AD-6).
5. Evolución de esquema: APK viejo descarta todo el snapshot por un tipo de ejercicio nuevo. -> cerrar: evolución solo aditiva, lector tolerante, puntero por schema_version (AD-3, AD-5).
6. Composición de lecciones: panel arma lecciones como lista explícita; la app muestrea ventanas. -> cerrar: lecciones = lista ordenada de ids; muestreo solo en modos de práctica (AD-3).
7. Ejercicios borrados: errores guardados referencian ids que ya no existen. -> cerrar: ids retirados siguen resolviendo (AD-4).
8. Eventos rechazados por tope de XP: la app muestra XP optimista y nunca reconcilia. -> cerrar: eventos rechazados se marcan y se excluyen del pliegue (AD-7).
9. Ruta de lectura entre usuarios: una consulta directa a eventos filtra datos de otros. -> cerrar: única ruta de lectura cruzada es una vista/función de liga (AD-8).
10. Modo invitado: un constructor permite uso anónimo y otro exige login; user_id en payload falsificable. -> cerrar: user_id lo asigna el servidor desde el JWT; invitado como supuesto (AD-6, AD-8).
11. Exportes de la base de datos en repositorio público: datos de usuarios expuestos. -> cerrar: exportes cifrados antes de subir (AD-14).
12. Observabilidad y límites: no dicho. -> Deferred.
