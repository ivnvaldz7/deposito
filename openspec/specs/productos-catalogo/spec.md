# Productos Catálogo — Full Specification

## Purpose

Product catalog management for Deposito: browse, create, edit, lifecycle actions, and two-step CSV/XLSX import.

## Requirements

### R1: Catalog List Page

The system SHALL render a searchable/filterable table (columns: Estado colored chip, Código or italicized "Código pendiente", Categoría with "MP" for droga, Presentación, Mercados chips). Action buttons MUST appear only for `encargado`; other roles see read-only.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Encargado sees actions | user is encargado | table loads | each row shows state-appropriate buttons |
| Non-encargado read-only | user is solicitante | table loads | no buttons visible |
| Search filters results | products exist | user types search term | table filters by matching code/name |
| Empty catalog | no products | page loads | shows "No hay productos en el catálogo" |
| No filter results | products exist | filter yields zero | shows "No se encontraron productos" |

### R2: Create Product

MUST be encargado-only. Fields conditional by category: etiqueta/estuche require presentation + ≥1 market + codigo with IGET/IGES prefix; frasco requires presentation (no markets, codigo optional); droga/MP requires neither (codigo optional). Creates directly as ACTIVO via `POST /api/deposito/productos`.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Create etiqueta | encargado, form filled | category etiqueta + 2 markets + IGETxxx submitted | POST succeeds, product is ACTIVO |
| Create frasco sin codigo | encargado, form filled | category frasco, codigo empty | POST succeeds, product is ACTIVO with codigo=null |
| Non-encargado blocked | user is solicitante | navigates to create | permission error |
| Missing markets | category etiqueta | submitted without markets | validation: "Debe seleccionar al menos un mercado" |
| Missing codigo | category etiqueta | submitted without codigo | validation: "El código es obligatorio para etiquetas y estuches" |
| Wrong prefix | category estuche | submitted with codigo beginning other than IGES | validation: "debe comenzar con IGES" |

### R3: Edit Product

MUST allow encargado to edit. PENDIENTE_REVISION: code + name + presentation + markets editable. ACTIVO/INACTIVO: name + presentation only (audited). Code required for etiqueta/estuche (IGET/IGES prefix), optional for frasco/droga.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Edit pending | PENDIENTE_REVISION product | encargado edits code + name | PATCH includes all changed fields |
| Edit active | ACTIVO product | encargado opens edit | code, category, markets disabled |
| Edit frasco sin codigo | INACTIVO frasco, codigo=null | encargado sets codigo | PATCH updates codigo |
| Edit etiqueta sin codigo | PENDIENTE_REVISION etiqueta | encargado omits codigo | validation error |

### R4: State Lifecycle

MUST support these encargado-only transitions: Activar (PENDIENTE_REVISION→ACTIVO, validates code/data, etiqueta/estuche creates zero inventory per market), Reactivar (INACTIVO→ACTIVO), Desactivar (ACTIVO→INACTIVO), Eliminar (only PENDIENTE_REVISION without relations, 409 otherwise).

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Activate etiqueta | PENDIENTE_REVISION etiqueta, 2 markets | encargado clicks Activar | 2 zero-inventory rows created |
| Delete pending | PENDIENTE_REVISION, no relations | encargado clicks Eliminar | 204, product removed |
| Delete active 409 | ACTIVO product | encargado clicks Eliminar | UI shows "No se puede eliminar un producto activo" |

### R5: Two-Step Import

MUST provide encargado-only import: Step 1 upload CSV/XLSX → `POST .../importaciones/dry-run` → preview with per-row errors. Step 2 confirm → `POST .../importaciones/confirmar` → creates PENDIENTE_REVISION rows in one transaction.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Dry-run partial | CSV: 3 valid + 2 invalid rows | encargado uploads | 3 valid previewed, 2 rows show specific errors |
| Confirm creates | dry-run showed 3 valid | encargado clicks Confirmar | 3 PENDIENTE_REVISION created, success count shown |
| Invalid file type | user selects .pdf | file attached | error: "Formato no soportado. Use CSV o XLSX" |

### R6: ProductoSelector

A reusable component fetching only ACTIVO products, filterable by category. MUST show market selector when etiqueta/estuche selected; hide for frasco/MP.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Select etiqueta | component mounted | user selects etiqueta | market dropdown appears |
| Select droga | component mounted | user selects droga | no market selector shown |
