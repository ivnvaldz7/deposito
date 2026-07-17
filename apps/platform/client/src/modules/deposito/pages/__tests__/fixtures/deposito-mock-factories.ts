/**
 * Factory functions for mock API responses used in Depósito page tests.
 */

export function createDashboardStats(overrides: Record<string, unknown> = {}) {
  return {
    totalDrogas: 12,
    drogasEnStock: 10,
    drogasSinStock: 2,
    totalEstuches: 8,
    estuchesSinStock: 1,
    totalEtiquetas: 15,
    etiquetasSinStock: 3,
    totalFrascos: 6,
    frascosSinStock: 1,
    movimientosHoy: 5,
    ultimosMovimientos: [
      {
        id: 'mov-1',
        tipo: 'ingreso_acta' as const,
        productoNombre: 'Vitamina B12',
        cantidad: 100,
        createdAt: '2026-07-17T10:00:00.000Z',
        user: { name: 'María López' },
      },
    ],
    stockBajo: [{ id: 'droga-1', nombre: 'Paracetamol', cantidad: 3 }],
    stockBajoEstuches: [],
    stockBajoEtiquetas: [],
    stockBajoFrascos: [],
    porVencer: [],
    ...overrides,
  }
}

export function createActaListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acta-1',
    fecha: '2026-07-17T00:00:00.000Z',
    estado: 'pendiente' as const,
    notas: null,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
    user: { name: 'María López' },
    _count: { items: 3 },
    items: [
      { lote: 'L2401', productoNombre: 'Vitamina B12', temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false },
    ],
    ...overrides,
  }
}

export function createActaList() {
  return [
    createActaListItem({ id: 'acta-1', estado: 'pendiente', _count: { items: 3 } }),
    createActaListItem({ id: 'acta-2', estado: 'completada', _count: { items: 5 } }),
  ]
}

export function createActa(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acta-1',
    fecha: '2026-07-17T00:00:00.000Z',
    estado: 'pendiente' as const,
    notas: 'Nota de prueba',
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
    user: { name: 'María López' },
    _count: { items: 2 },
    items: [
      {
        id: 'item-1',
        actaId: 'acta-1',
        categoria: 'droga' as const,
        productoNombre: 'Vitamina B12',
        lote: 'L2401',
        vencimiento: '2027-01-01T00:00:00.000Z',
        temperaturaTransporte: '2-8°C',
        condicionEmbalaje: 'bueno' as const,
        observacionesCalidad: null,
        aprobadoCalidad: true,
        cantidadIngresada: 100,
        cantidadDistribuida: 50,
        mercado: null,
        createdAt: '2026-07-17T10:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

export function createDrogaRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'droga-1',
    productoId: 'prod-1',
    nombre: 'Paracetamol',
    lote: 'L2401',
    vencimiento: '2027-06-01T00:00:00.000Z',
    cantidad: 50,
    updatedAt: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

export function createDrogaRecords() {
  return [
    createDrogaRecord(),
    createDrogaRecord({ id: 'droga-2', nombre: 'Ibuprofeno', lote: 'L2402', cantidad: 5 }),
  ]
}

export function createEstuche(overrides: Record<string, unknown> = {}) {
  return {
    id: 'estuche-1',
    productoId: 'prod-1',
    articulo: 'AMANTINA PREMIUM 250 ML',
    mercado: 'argentina' as const,
    cantidad: 200,
    updatedAt: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

export function createEstucheList() {
  return [
    createEstuche(),
    createEstuche({ id: 'estuche-2', articulo: 'AMANTINA PREMIUM 500 ML', mercado: 'colombia' as const, cantidad: 30 }),
  ]
}

export function createEtiqueta(overrides: Record<string, unknown> = {}) {
  return {
    id: 'etiqueta-1',
    productoId: 'prod-1',
    articulo: 'ETIQ AMANTINA 250 ML',
    mercado: 'argentina' as const,
    cantidad: 500,
    updatedAt: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

export function createEtiquetaList() {
  return [
    createEtiqueta(),
    createEtiqueta({ id: 'etiqueta-2', articulo: 'ETIQ AMANTINA 500 ML', mercado: 'mexico' as const, cantidad: 20 }),
  ]
}

export function createFrasco(overrides: Record<string, unknown> = {}) {
  return {
    id: 'frasco-1',
    productoId: 'prod-1',
    articulo: 'DORADO 250 ML',
    unidadesPorCaja: 12,
    cantidadCajas: 20,
    total: 240,
    updatedAt: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

export function createFrascoList() {
  return [
    createFrasco(),
    createFrasco({ id: 'frasco-2', articulo: 'DORADO 500 ML', unidadesPorCaja: 6, cantidadCajas: 2, total: 12 }),
  ]
}

export function createOrden(overrides: Record<string, unknown> = {}) {
  return {
    id: 'orden-1',
    categoria: 'droga' as const,
    productoNombre: 'Vitamina B12',
    mercado: null,
    cantidad: 100,
    urgencia: 'normal' as const,
    estado: 'solicitada' as const,
    motivoRechazo: null,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
    solicitante: { id: 'user-1', name: 'Juan Pérez', role: 'solicitante' },
    aprobador: null,
    ...overrides,
  }
}

export function createOrdenList() {
  return [
    createOrden(),
    createOrden({ id: 'orden-2', productoNombre: 'Amantina Premium', urgencia: 'urgente', estado: 'aprobada' }),
  ]
}

export function createMovimiento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mov-1',
    tipo: 'ingreso_acta' as const,
    categoria: 'droga',
    productoNombre: 'Vitamina B12',
    cantidad: 100,
    referenciaId: 'acta-1',
    justificacion: null,
    createdAt: '2026-07-17T10:00:00.000Z',
    user: { name: 'María López' },
    ...overrides,
  }
}

export function createMovimientoList() {
  return [
    createMovimiento(),
    createMovimiento({ id: 'mov-2', tipo: 'egreso_orden', productoNombre: 'Paracetamol', cantidad: -10 }),
  ]
}

export function createPendiente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pend-1',
    categoria: 'frasco',
    articulo: 'DORADO 250 ML',
    cantidad: 5,
    destino: 'Planta de esterilización',
    estado: 'en_esterilizacion' as const,
    fechaEnvio: '2026-07-15T00:00:00.000Z',
    fechaRetornoEstimada: '2026-07-22T00:00:00.000Z',
    fechaRecibido: null,
    notas: null,
    createdAt: '2026-07-15T10:00:00.000Z',
    user: { name: 'María López' },
    ...overrides,
  }
}

export function createPendienteList() {
  return [
    createPendiente(),
    createPendiente({ id: 'pend-2', estado: 'recibido', fechaRecibido: '2026-07-20T00:00:00.000Z' }),
  ]
}

export function createMetricasData(overrides: Record<string, unknown> = {}) {
  return {
    totalIngresos: 1500,
    totalEgresos: 800,
    balance: 700,
    movimientosPeriodo: 45,
    ingresosPorCategoria: [
      { categoria: 'droga', total: 800 },
      { categoria: 'estuche', total: 400 },
    ],
    topProductosIngresados: [
      { productoNombre: 'Vitamina B12', total: 300 },
      { productoNombre: 'Paracetamol', total: 200 },
    ],
    topProductosSolicitados: [
      { productoNombre: 'Amantina Premium', total: 150 },
      { productoNombre: 'Ibuprofeno', total: 100 },
    ],
    ...overrides,
  }
}

export function createUsuario(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'maria@test.com',
    name: 'María López',
    role: 'encargado' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function createUsuarioList() {
  return [
    createUsuario(),
    createUsuario({ id: 'user-2', email: 'juan@test.com', name: 'Juan Pérez', role: 'solicitante' as const }),
    createUsuario({ id: 'user-3', email: 'ana@test.com', name: 'Ana García', role: 'observador' as const }),
  ]
}
