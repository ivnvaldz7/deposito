# Existencias en ZEROX

## Alcance

- Dos vistas de saldos externos: los 17 frascos autorizados y tapas del catálogo.
- Ingresos y salidas manuales de ZEROX, independientes de Actas y del stock del depósito.
- Historial inmutable con fecha del movimiento retroactiva, fecha real de carga, usuario, cantidad, saldo resultante y observación.
- Filtros por fecha, producto, tipo y rango de cantidades; exportación Excel de historial y saldos.
- Vista principal compacta de Frascos/Tapas, con el historial auditable en un modal amplio accesible desde las solapas.
- Reparar la visibilidad del modal de Nueva orden en el área de Órdenes.

## No objetivos

- Modificar Actas, inventario del depósito o pedidos de estuches.
- Automatizar logística o sincronizar movimientos con ZEROX.
- Reescribir registros históricos de InsumoPendiente sin conciliación humana.

## Restricciones

- No permitir saldos negativos; serializar movimientos por producto y confirmar el registro de auditoría en la misma transacción.
- No editar ni borrar movimientos: errores se corrigen con otro movimiento documentado.
- Validar elegibilidad del producto en servidor y mantener permisos actuales de `pendientes`.
- No aplicar migraciones a producción automáticamente.

## Nivel de riesgo

`alto`: nuevo esquema de datos, auditoría, concurrencia y permisos. Requiere revisión independiente y verificación antes de despliegue.

## Criterios de aceptación

- [x] Dos tablas de ZEROX, frascos autorizados y tapas, muestran saldo por producto.
- [x] Ingreso/salida manual validado, con fecha retroactiva y doble fecha de auditoría.
- [x] Saldos nunca negativos y corrección trazable sin editar historia.
- [x] Historial filtrable en modal y exportable junto con saldos en Excel (`.xlsx`) con columnas, fechas, cantidades numéricas y autofiltros.
- [x] Modal Nueva orden montado por encima del layout; prueba de regresión de visibilidad.
- [x] Suites completas de cliente y servidor, lint, typecheck, validación Prisma y build de producción verifican el cambio.

## Estado e historial

- Estado actual: `interfaz compacta servida; exportación XLSX compilada pero pendiente de reinicio del servidor con permisos de administrador`.
- 2026-10-15 — Codex — alcance confirmado por el usuario.
- 2026-10-15 — Codex — respaldo de `platform` y aplicación de `20261009150000_ordenes_entrega_parcial` y `20261015120000_zerox_movimientos`; sin registros iniciales inventados. Revisión independiente sin hallazgos pendientes.
- 2026-10-15 — Codex — suites completas en verde (561 pruebas de cliente y 795 de servidor), lint, typecheck y build de producción correctos. Tras respaldo verificado de `platform_prod`, se aplicó la migración ZEROX y se desplegó la aplicación en `localhost:3000`. Health HTTP 200 con base conectada, una instancia activa y cero movimientos ZEROX iniciales. La interfaz autenticada no se inspeccionó en vivo por falta de sesión iniciada.
- 2026-10-15 — Codex — se quitaron los resúmenes y el aviso redundante; el historial pasa a un modal accesible. Las dos exportaciones pasan de CSV a XLSX para evitar que Excel regional agrupe todo en una columna, con datos tipados y filtros de hoja. Sin migraciones ni cambios en el flujo de movimientos.
- 2026-10-15 — Codex — suites completas nuevamente en verde (561 cliente, 795 servidor), lint, typecheck y build correctos. El despliegue se detuvo en `STOP SERVER`: el token interactivo recibió `Acceso denegado` al cerrar el PID 17996 del servicio S4U. Health sigue en 200 y el cliente compilado se sirve, pero el backend anterior continúa activo. El cliente conserva `.csv` si recibe la respuesta antigua y usará `.xlsx` tras el reinicio administrativo. No se forzó ni eliminó el proceso.
