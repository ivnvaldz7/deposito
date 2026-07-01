# Glosario — Plataforma

Vocabulario del dominio para mantener consistencia en el código, la documentación y las conversaciones del equipo.

## Dominio General

| Término | Definición |
|---------|------------|
| Plataforma | Sistema unificado de gestión que agrupa los módulos Depósito, Ale-Bet y Admin |
| Depósito | Módulo de gestión de inventario farmacéutico (drogas, estuches, etiquetas, frascos) |
| Ale-Bet | Módulo de gestión de pedidos, clientes y despacho |
| Admin | Módulo de administración de usuarios y permisos de la plataforma |

## Depósito

| Término | Definición |
|---------|------------|
| Acta | Registro de ingreso de materiales al depósito. Contiene uno o más items (drogas, estuches, etc.) |
| ActaItem | Line item dentro de un acta. Representa una cantidad de un producto específico que ingresa |
| Droga | Principio activo o compuesto farmacéutico almacenado por lote con fecha de vencimiento |
| Estuche | Empaque o presentación comercial de un producto, asociado a un mercado de exportación |
| Etiqueta | Identificador visual del producto, asociado a un mercado |
| Frasco | Envase para producto, medido en unidades por caja y cantidad de cajas |
| Insumo Pendiente | Material enviado a esterilización externa. Tiene estado: en_esterilizacion → recibido |
| Orden de Producción | Solicitud formal de materiales para producción. Estados: solicitada → aprobada → ejecutada → completada / rechazada |
| Mercado | País de destino del producto (argentina, colombia, mexico, ecuador, bolivia, paraguay, no_exportable) |
| Categoría | Tipo de inventario: droga, estuche, etiqueta, frasco |
| FIFO | First In, First Out — método de distribución de stock donde lo que ingresó primero se distribuye primero |

## Ale-Bet

| Término | Definición |
|---------|------------|
| Pedido | Solicitud de productos realizada por un cliente. Flujo: pendiente → aprobado → en_armado → completado / cancelado |
| ItemPedido | Line item dentro de un pedido. Representa una cantidad de un producto |
| Producto | Bien ofrecido en el catálogo de Ale-Bet. Tiene SKU único |
| Lote | Conjunto de unidades de un producto con misma fecha de producción y vencimiento |
| Cliente | Entidad que realiza pedidos. Puede ser persona física o jurídica |
| MovimientoStock | Registro de auditoría de entrada/salida/ajuste de stock |

## Técnico

| Término | Definición |
|---------|------------|
| PlatformUser | Usuario global de la plataforma. Tiene acceso a una o más apps |
| AppAccess | Permiso que relaciona un PlatformUser con una app y un rol |
| JWT | JSON Web Token — token de acceso con 15 minutos de validez |
| Refresh Token | Token de larga duración (7 días) almacenado en cookie httpOnly |
| SSE | Server-Sent Events — mecanismo de notificaciones en tiempo real |
| Multi-schema | Estrategia de Prisma donde cada módulo tiene su propio schema SQL dentro de la misma base de datos |
