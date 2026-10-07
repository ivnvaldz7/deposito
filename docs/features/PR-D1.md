# PR-D1 — Cajas de embalaje y salida automática de insumos por lote de producción

> **Estado:** `DEFERRED`
> **Prioridad:** `POST_MVP`
> **Implementación:** `NO INICIADA`

## Decisión congelada

Esta feature queda diferida para evitar ampliar el alcance del MVP con un inventario nuevo, órdenes multiinsumo y cálculo automático. **No está aprobada para Builder ni autoriza implementación.**

El MVP actual continuará con las categorías de stock existentes y con las órdenes actuales de un único insumo.

## Dominio confirmado

### Caja de embalaje

Una caja de embalaje representa una caja de cartón usada para embalar producto terminado. Debe permitir conocer:

| Dato | Definición |
|---|---|
| Código | Identificador o SKU específico de la caja. |
| Nombre | Nombre descriptivo de la caja. |
| Producto terminado asociado | Producto final específico que se embala con esa caja. |
| Frascos por caja | Capacidad de frascos del producto terminado. |
| Stock disponible | Cantidad de cajas físicas disponibles. |
| Estado | Activa o inactiva. |

**Ejemplo confirmado**

| Dato | Valor |
|---|---|
| Caja | Caja Olivitasan 500 ml |
| Producto asociado | Olivitasan 500 ml |
| Frascos por caja | 20 |
| Stock disponible | 850 cajas |

### Diferencia con `InventarioFrasco`

`InventarioFrasco.cantidadCajas` representa las cajas utilizadas para almacenar frascos vacíos recibidos.

La futura **CajaEmbalaje** representa las cajas de cartón utilizadas para embalar producto terminado. No deben reutilizar modelo, nombre ni significado.

### Unidad de stock y movimientos futuros

Una unidad de stock equivale a una caja física. Por lo tanto, `cantidad = 850` significa **850 cajas disponibles**.

Reglas previstas:

- `cantidad` entera;
- cero válido;
- cantidad negativa prohibida;
- movimientos auditados para ingresos, ajustes y egresos.

### Capacidad y producto asociado

- `frascosPorCaja` debe ser un entero mayor que cero.
- La capacidad pertenece a la definición de la caja, no a cada movimiento ni ingreso de inventario.
- Toda caja corresponde a un producto terminado específico.
- Una caja distinta para otra presentación o mercado se registra como otro código/SKU.
- No se incorporará un campo genérico `mercado` al inventario de cajas.

## Cálculo futuro por lote

El cálculo planificado —**no implementado en el MVP**— será:

```text
cajasRequeridas = ceil(unidadesPorLote * cantidadLotes / frascosPorCaja)
```

Ejemplo confirmado:

| Concepto | Valor |
|---|---:|
| Producto | Olivitasan 500 ml |
| Unidades por lote de producción | 2400 |
| Frascos por caja | 20 |
| Un lote | 2400 / 20 = 120 cajas |
| Dos lotes | 4800 / 20 = 240 cajas |

## Arquitectura futura prevista

### Catálogo y stock de cajas

Probablemente serán necesarios bloques separados para:

- definición de `CajaEmbalaje` o configuración tipada equivalente;
- `InventarioCajaEmbalaje`;
- constraints;
- movimientos;
- API;
- importación de stock.

### Configuración de acondicionamiento

Debe vincular conceptualmente:

```text
productoFinalId
unidadesPorLote
frascoId
etiquetaId
estucheId
cajaEmbalajeId
```

No incluye fórmulas químicas ni drogas.

### Orden multiinsumo

La evolución posterior requerirá:

- `OrdenProduccionItem`;
- cantidades calculadas y cantidades finales;
- ajustes con motivo;
- ejecución atómica;
- movimiento por insumo;
- descuento por lotes físicos;
- rollback total.

## Flujo futuro documentado

```text
Producción avisa verbalmente
→ encargado de Depósito crea la orden
→ selecciona producto terminado
→ indica cantidad de lotes de producción
→ sistema calcula frascos, etiquetas, estuches y cajas
→ encargado revisa o ajusta
→ sistema verifica stock
→ encargado confirma entrega
→ descuento atómico
→ movimientos auditados
```

No se implementarán solicitudes, notificaciones ni bandejas para Producción.

## Modos futuros

| Modo | Comportamiento |
|---|---|
| `POR_LOTE` | Modo principal. El sistema calcula automáticamente las cantidades. |
| `MANUAL` | El encargado selecciona insumos y cantidades individualmente. |
| `AJUSTE CONTROLADO` | El encargado modifica una cantidad calculada. Conserva cantidad calculada, cantidad final, usuario, fecha y motivo obligatorio. |

## Fuera del MVP actual

- Cajas de embalaje como inventario.
- Cálculo por lote de producción.
- `ConfiguracionLote`.
- `OrdenProduccionItem`.
- Órdenes multiinsumo.
- Fórmulas químicas.
- Solicitud digital desde Producción.
- Notificaciones nuevas.
- Reservas.
- Entregas parciales.
- Cálculo automático de materiales.
- Modificación de la página actual para este flujo.

## Limitación aceptada del MVP

El MVP podrá operar con las categorías actuales de stock y con órdenes existentes de un único insumo.

Las cajas de embalaje deberán administrarse temporalmente fuera del sistema hasta activar esta feature. El MVP **no** tendrá trazabilidad completa de cajas.

## Condiciones para reactivar

PR-D1 podrá pasar de `DEFERRED` a `PLANNING` cuando estén cerrados:

1. CI robusta y sin bypass del Prisma Client.
2. Carga del stock real.
3. Catálogo actual validado.
4. Usuarios y roles reales.
5. Flujo existente de órdenes probado de punta a punta.
6. MVP desplegado o validado en ambiente piloto.

## Próximo trabajo activo

### MVP-01 — Catálogo maestro de productos e importación

**Objetivo:** definir el catálogo permanente de productos de Depósito e importar productos pendientes de revisión, sin cargar stock ni incorporar cajas de embalaje.

La carga inicial de cantidades reales queda para MVP-02, sobre productos existentes.

## Handoff

- Estado de handoff: `DEFERRED`.
- Próximo rol para esta feature: ninguno hasta que se cumplan las condiciones de reactivación.
- Builder: **no autorizado**.
