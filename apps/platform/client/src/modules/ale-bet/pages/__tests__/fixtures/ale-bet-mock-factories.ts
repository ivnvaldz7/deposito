/**
 * Factory functions for mock API responses used in Ale-Bet page tests.
 */

export function createDashboardOverview(overrides: Record<string, unknown> = {}) {
  return {
    stockCritico: 3,
    pedidosHoy: 8,
    enArmado: 2,
    totalProductos: 45,
    pedidosRecientes: [
      {
        id: 'pedido-1',
        numero: 'P-001',
        estado: 'EN_ARMADO' as const,
        clienteNombre: 'Cliente A',
        vendedorNombre: 'Vendedor 1',
        armadorNombre: null,
        cantidadItems: 3,
        createdAt: '2026-07-17T10:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

export function createProducto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    nombre: 'Producto A',
    sku: 'SKU-001',
    stockMinimo: 100,
    unidadesPorCaja: 15,
    activo: true,
    stock: 500,
    fisico: 500,
    reservado: 0,
    disponible: 500,
    stockBajo: false,
    lotes: [],
    ...overrides,
  }
}

export function createProductoList() {
  return [
    createProducto(),
    createProducto({ id: 'prod-2', nombre: 'Producto B', sku: 'SKU-002', stock: 50, fisico: 50, reservado: 0, disponible: 50, stockBajo: true }),
  ]
}

export function createProductoSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    nombre: 'Producto A',
    sku: 'SKU-001',
    unidadesPorCaja: 15,
    fisico: 500,
    reservado: 0,
    disponible: 500,
    ...overrides,
  }
}

export function createLote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lote-1',
    numero: 'L-2024-001',
    cajas: 10,
    sueltos: 5,
    fechaProduccion: '2026-01-15T00:00:00.000Z',
    fechaVencimiento: '2028-01-15T00:00:00.000Z',
    activo: true,
    unidades: 155,
    unidadesPorCaja: 15,
    ...overrides,
  }
}

export function createCliente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cliente-1',
    nombre: 'Cliente A',
    contacto: 'cliente@test.com',
    referencia: null,
    direccion: 'Calle 123',
    localidad: null,
    provincia: null,
    cuit: null,
    condicionIva: null,
    condicionVenta: null,
    estado: 'VALIDADO' as const,
    activo: true,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

export function createClienteList() {
  return [
    createCliente(),
    createCliente({ id: 'cliente-2', nombre: 'Cliente B', contacto: null, referencia: null, direccion: null }),
  ]
}

export function createClientePendiente(overrides: Record<string, unknown> = {}) {
  return createCliente({ id: 'cliente-2', nombre: 'Cliente B', contacto: null, referencia: null, estado: 'PENDIENTE_CLIENTE' as const, ...overrides })
}

export function createTransportista(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trans-1',
    nombre: 'Transporte A',
    direccion: 'Calle 1 234',
    activo: true,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

export function createTransportistaList() {
  return [
    createTransportista(),
    createTransportista({ id: 'trans-2', nombre: 'Transporte B', direccion: 'Calle 2 567', activo: false }),
  ]
}

export function createPedidoItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    productoId: 'prod-1',
    cantidad: 10,
    completado: false,
    producto: { id: 'prod-1', nombre: 'Producto A', sku: 'SKU-001', unidadesPorCaja: 15 },
    ...overrides,
  }
}

export function createRemito(overrides: Record<string, unknown> = {}) {
  return {
    id: 'remito-1',
    pedidoId: 'pedido-1',
    numero: 'R-001',
    fecha: '2026-07-17T10:00:00.000Z',
    transportistaId: null,
    transporteNombre: 'Transporte A',
    transporteDireccion: 'Calle 1',
    clienteSnapshot: {},
    transporteSnapshot: {},
    itemsSnapshot: [{ productoId: 'prod-1', nombre: 'Producto A', cantidad: 10 }],
    estado: 'VIGENTE' as const,
    invalidadoAt: null,
    invalidadoPor: null,
    motivoInvalidacion: null,
    createdBy: 'user-1',
    ...overrides,
  }
}

export function createPedido(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pedido-1',
    numero: 'P-001',
    clienteId: 'cliente-1',
    vendedorId: 'vendedor-1',
    armadorId: null,
    estado: 'BORRADOR' as const,
    version: 1,
    cancelacionSolicitadaAt: null,
    cancelacionSolicitadaPor: null,
    motivoCancelacion: null,
    aprobadoAt: null,
    preparadoAt: null,
    despachadoAt: null,
    canceladoAt: null,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
    cliente: createCliente(),
    items: [
      {
        id: 'item-1',
        productoId: 'prod-1',
        cantidad: 10,
        completado: false,
        producto: { id: 'prod-1', nombre: 'Producto A', sku: 'SKU-001', unidadesPorCaja: 15 },
      },
    ],
    vendedorNombre: 'Vendedor 1',
    armadorNombre: null,
    ...overrides,
  }
}

export function createPedidoList() {
  return [
    createPedido(),
    createPedido({ id: 'pedido-2', numero: 'P-002', estado: 'APROBADO' as const }),
  ]
}

export function createStockOverview(overrides: Record<string, unknown> = {}) {
  return {
    productos: [
      createProducto(),
      createProducto({ id: 'prod-2', nombre: 'Producto B', sku: 'SKU-002', stock: 50, stockBajo: true }),
    ],
    movimientos: [
      {
        id: 'mov-1',
        productoId: 'prod-1',
        cantidad: 100,
        tipo: 'ENTRADA_MANUAL' as const,
        referencia: 'Ref-001',
        usuarioId: 'user-1',
        createdAt: '2026-07-17T10:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

export function createHistorialPedido(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hist-1',
    numero: 'P-001',
    estado: 'COMPLETADO' as const,
    createdAt: '2026-07-17T10:00:00.000Z',
    clienteNombre: 'Cliente A',
    vendedorNombre: 'Vendedor 1',
    armadorNombre: null,
    items: [{ productoNombre: 'Producto A', cantidad: 10 }],
    ...overrides,
  }
}

export function createHistorialPedidoList() {
  return [
    createHistorialPedido(),
    createHistorialPedido({ id: 'hist-2', numero: 'P-002', estado: 'CANCELADO' as const }),
  ]
}
