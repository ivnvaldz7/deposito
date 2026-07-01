# Contexto de Negocio — Plataforma

## Propósito del Sistema

Sistema SaaS de gestión operativa para depósitos de laboratorios veterinarios y farmacéuticos. El producto unifica tres áreas clave: control de inventario farmacéutico (Depósito), gestión de pedidos y despacho (Ale-Bet), y administración de usuarios (Admin).

## Usuarios del Sistema

### Depósito

| Rol | Responsabilidad |
|-----|-----------------|
| Encargado | Supervisa el depósito. Crea actas de ingreso, gestiona inventario, aprueba/rechaza órdenes de producción, administra usuarios del módulo |
| Solicitante | Solicita órdenes de producción. Consulta inventario |
| Observador | Solo lectura en todo el módulo |

### Ale-Bet

| Rol | Responsabilidad |
|-----|-----------------|
| Admin | Acceso total: productos, clientes, pedidos, stock, historial |
| Vendedor | Crea y gestiona pedidos, administra clientes, consulta historial |
| Armador | Visualiza pedidos en estado "en armado", actualiza su progreso |

### Plataforma

| Rol | Responsabilidad |
|-----|-----------------|
| Platform Admin | Crea usuarios, asigna accesos a apps con roles específicos |

## Reglas de Negocio

### Inventario

1. **Trazabilidad total**: ningún movimiento de stock ocurre sin un registro de origen (acta de ingreso, orden de producción, o ajuste justificado)
2. **FIFO**: la distribución de stock desde actas sigue el orden de ingreso (primero en entrar, primero en salir)
3. **Stock mínimo**: cada producto tiene un umbral mínimo configurable. Al alcanzarlo, se genera alerta
4. **Lotes con vencimiento**: las drogas se gestionan por lote con fecha de vencimiento. El sistema alerta productos próximos a vencer

### Actas de Ingreso

1. Un acta comienza en estado `pendiente`
2. Se le agregan items (drogas, estuches, etiquetas, frascos) con cantidades
3. Opcionalmente se realiza control de calidad (temperatura, condición de embalaje, aprobación)
4. La distribución de items al inventario puede ser parcial
5. Cuando todos los items están completamente distribuidos, el acta pasa a `completada`

### Órdenes de Producción

1. Un solicitante crea una orden
2. El encargado la aprueba o la rechaza (con motivo)
3. Al ejecutarse, el sistema descuenta automáticamente los materiales del inventario
4. Al completarse, se registra la salida definitiva

### Pedidos (Ale-Bet)

1. Un vendedor crea un pedido para un cliente
2. El pedido pasa por estados: `PENDIENTE → APROBADO → EN_ARMADO → COMPLETADO`
3. En cualquier momento antes de completarse puede cancelarse
4. El stock se descuenta al completar el pedido

### Autenticación y Acceso

1. El ingreso es exclusivamente mediante Google OAuth
2. Al primer ingreso, si el email está en la lista blanca, se crea el usuario automáticamente
3. Un usuario deshabilitado no puede acceder a ninguna app
4. Cada usuario tiene acceso granular por app con un rol específico

## Flujos Principales

### Ingreso de Materiales

```
Encargado → Crea acta → Agrega items → Control calidad (opcional) → Distribuye a inventario → Acta completada
```

### Orden de Producción

```
Solicitante → Crea orden → Encargado aprueba/rechaza → Ejecuta (descuenta stock) → Completa
```

### Pedido Cliente

```
Vendedor → Crea pedido → Admin aprueba → Armador prepara → Completa → Descuenta stock
```
