# CONTEXT.md — Depósito

## Estado actual

**Fase:** Pre-setup (Fase 1 no iniciada)
**Última sesión:** N/A
**Próximo paso:** Setup del monorepo, instalación de dependencias, schema de Prisma inicial

## Dominio de negocio

### ¿Qué es un depósito de laboratorio veterinario?

Un espacio donde se almacenan todos los insumos necesarios para fabricar productos veterinarios (medicamentos, suplementos). El encargado de depósito gestiona:

- **Drogas:** materias primas / principios activos (Ácido Cítrico, Vitaminas, ATP, etc.). ~50 productos.
- **Estuches:** packaging de producto terminado, separado por mercado de exportación (Argentina, Colombia, México, Ecuador, Bolivia, Paraguay). ~40 artículos + variantes por mercado.
- **Etiquetas:** misma lógica que estuches, separado por mercado. ~45 artículos + variantes.
- **Frascos:** envases físicos (Dorado 250ml, PVC 100ml, etc.). ~20 tipos. Algunos pasan por planta de esterilización antes de poder usarse.

### Flujo operativo actual (sin el sistema)

1. Llega mercadería → se anota en planilla Excel con fecha, producto, lote, cantidad
2. Se actualiza la hoja correspondiente del Excel manualmente
3. Producción pide insumos por WhatsApp o de palabra
4. Encargado descuenta de la planilla (si se acuerda)
5. No hay registro formal de quién pidió qué ni cuándo
6. Control de vencimientos es manual y propenso a olvidos
7. Validación regulatoria de estuches no tiene proceso formal

### Problemas principales

- Planillas desactualizadas (el stock real no coincide con el registrado)
- Pedidos sin trazabilidad
- No hay visibilidad en tiempo real para otros sectores
- Control de vencimientos se escapa
- Procesos informales imposibles de auditar

## Usuarios

- **Ivan (developer + encargado):** primer usuario y tester. Opera desde PC en el depósito.
- **Observadores (~5 personas):** producción y supervisores, acceden desde celular y PC.
- **Solicitantes (futuro):** producción que genera pedidos formales.

## Datos de referencia

La planilla Excel original está en `docs/DEPOSITO_original.xlsx` como referencia de estructura de datos. Las hojas relevantes son:
- DROGAS: producto + cantidad (~50 items)
- ESTUCHES: artículo + cantidad por mercado (~40 items × 7 mercados)
- ETIQUETAS: artículo + cantidad por mercado (~45 items × 7 mercados)
- FRASCOS: artículo + unidades por caja + cantidad cajas + total (~20 items)

Hojas MOVIMIENTOS y PRODUCTO fueron descartadas del scope (corresponden a logística).
