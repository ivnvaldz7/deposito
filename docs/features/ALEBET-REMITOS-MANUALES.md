# ALEBET — Remitos manuales de Facturación

## Objetivo

Permitir que Facturación cree e imprima un remito sin partir de un pedido existente, manteniendo la numeración oficial y sin descontar stock al emitirlo.

## Flujo acordado

1. Facturación abre **Remitos**, selecciona o crea un cliente, carga productos, cantidades y el transporte (o entrega directa al domicilio del cliente).
2. Al emitir, se asigna el próximo número configurado, se genera el PDF y el registro queda visible como **Pendiente a descuento**.
3. Encargado o administrador revisa el remito desde Pedidos y aprueba el descuento.
4. Sólo en esa aprobación se consulta el stock actual y se descuenta por lote. Si no alcanza, se bloquea la operación sin modificar stock.

## Reglas

- Facturación puede emitir incluso cuando no haya stock suficiente.
- La configuración de correlativo sigue siendo manual: Facturación ingresa una vez el próximo número válido y luego el sistema continúa desde allí.
- El remito manual conserva cliente, transporte e ítems como snapshots para que el PDF histórico no cambie.
- Los productos del formulario incluyen el catálogo completo activo, sin separar productos nuevos de antiguos.
- Las devoluciones de un remito ya descontado deben reponer únicamente las unidades efectivamente consumidas.

## Criterios de aceptación

- [ ] Facturación puede crear un cliente desde el mismo formulario.
- [ ] Facturación puede emitir y descargar/imprimir un remito manual.
- [ ] El listado de Pedidos muestra el estado `Pendiente a descuento`.
- [ ] Sólo admin/encargado puede aprobar el descuento.
- [ ] La aprobación valida stock en ese momento, descuenta por las reservas/lotes correspondientes y es atómica.
- [ ] El PDF conserva el diseño de remito vigente.
- [ ] Se validan rutas, permisos, compilación, pruebas y el flujo servidor/API/cliente.
