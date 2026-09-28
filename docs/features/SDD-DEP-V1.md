# DEP-V1 — Solicitudes lean de Depósito

## Alcance final

Una solicitud contiene una o más líneas de `DepositoProducto` activo. Se crea directamente en `SOLICITADO`, sin tocar stock. El encargado puede ajustar la cantidad final por línea y confirmar o rechazar.

La confirmación es una transacción serializable: bloquea la solicitud e inventarios, valida la disponibilidad completa y solo entonces descuenta y crea movimientos `egreso_partida`. Ante un faltante, revierte todo.

## Modelo

- `PartidaProduccion`: `id`, `solicitanteId`, `estado`, `notas`, `confirmadoPorId`, `confirmadoAt`, `motivoRechazo`, `createdAt`.
- `ItemSolicitud`: `id`, `partidaId`, `productoId`, `mercado`, `cantidadSolicitada`, `cantidadFinal`.

`cantidadFinal = null` usa `cantidadSolicitada`. Drogas usan cantidades decimales/FIFO. Frascos, estuches y etiquetas usan enteros. Mercado es obligatorio solamente en estuche y etiqueta.

## Exclusiones

No hay familia, presentaciones, variantes, recetas, materiales calculados, BOM, preview, sugerencias, endpoint `/enviar` ni sincronización de Google Sheets. `OrdenProduccion` permanece intacta.

## Migración

`20260917120000_dep_v1_partidas_recetas` es la única migración DEP-V1 final y aditiva. Esta migración puede aplicarse a `platform_prod` únicamente con autorización explícita del usuario, backup productivo previo, preflight limpio y procedimiento de migración productiva. Si DEV/TEST ya aplicó el experimento anterior, se reconstruye explícitamente esa base descartable antes de aplicar la migración.
