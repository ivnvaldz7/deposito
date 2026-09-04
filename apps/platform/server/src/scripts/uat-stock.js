require('dotenv').config()
const { signAccessToken } = require('@platform/core')
const crypto = require('crypto')

async function run() {
  const token = signAccessToken({ 
    sub: 'test-user', 
    email: 'test@example.com', 
    apps: { 'ale-bet': { rol: 'admin', activo: true } }
  })
  
  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
  
  const BASE_URL = 'http://localhost:3000/api/ale-bet'
  
  async function apiGet(path) {
    const res = await fetch(BASE_URL + path, { headers })
    const data = await res.json().catch(() => null)
    return { status: res.status, data }
  }
  
  async function apiPost(path, body, customHeaders = {}) {
    const res = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: { ...headers, ...customHeaders },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => null)
    return { status: res.status, data }
  }

  async function apiPatch(path, body, customHeaders = {}) {
    const res = await fetch(BASE_URL + path, {
      method: 'PATCH',
      headers: { ...headers, ...customHeaders },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => null)
    return { status: res.status, data }
  }

  const PRODUCTO_ID = 'cmsrty86s0000dkojp0pgl3df'
  const LOTE_ID = 'cmsrty8710001dkoji4tp43pr'
  const UBICACION_DEPOSITO = 'stock-location-deposito'
  const UBICACION_ACONDICIONADO = 'stock-location-acondicionado'
  const runId = crypto.randomUUID()

  console.log('\\n--- UAT STOCK ADMIN ---')

  // 1. Ajustar DEPOSITO a 100
  console.log('\\n1. Ajustar DEPÓSITO a 100')
  const r1 = await apiPatch(`/productos/${PRODUCTO_ID}/stock/lotes/${LOTE_ID}/ajuste`, {
    ubicacionId: UBICACION_DEPOSITO,
    cantidadFinal: 100,
    motivo: 'UAT TEST 1'
  }, { 'Idempotency-Key': `uat-1-${runId}` })
  console.log('Status:', r1.status)
  
  const s1 = await apiGet(`/productos/${PRODUCTO_ID}/stock`)
  console.log('Result:', JSON.stringify(s1.data.lotes.find(l => l.id === LOTE_ID), null, 2))

  // 2. Ajustar ACONDICIONADO a 50
  console.log('\\n2. Ajustar ACONDICIONADO a 50')
  const r2 = await apiPatch(`/productos/${PRODUCTO_ID}/stock/lotes/${LOTE_ID}/ajuste`, {
    ubicacionId: UBICACION_ACONDICIONADO,
    cantidadFinal: 50,
    motivo: 'UAT TEST 2'
  }, { 'Idempotency-Key': `uat-2-${runId}` })
  console.log('Status:', r2.status)
  
  const s2 = await apiGet(`/productos/${PRODUCTO_ID}/stock`)
  console.log('Result:', JSON.stringify(s2.data.lotes.find(l => l.id === LOTE_ID), null, 2))

  // 3. LOGISTICA -> STOCK
  console.log('\\n3. Verificar en LOGÍSTICA -> STOCK')
  const r3 = await apiGet(`/stock`)
  const stockItem = r3.data.stock?.find(i => i.producto.id === PRODUCTO_ID && i.lote.id === LOTE_ID) || r3.data.productos?.find(i => i.id === PRODUCTO_ID)?.lotes?.find(l => l.id === LOTE_ID)
  console.log('Stock API Result (Lote):', JSON.stringify(stockItem))

  // 4. Transferir 20 DEPOSITO -> ACONDICIONADO
  console.log('\\n4. Transferir 20 DEPÓSITO -> ACONDICIONADO')
  const r4 = await apiPost(`/stock/transferencias`, {
    productoId: PRODUCTO_ID,
    loteId: LOTE_ID,
    origen: 'DEPOSITO',
    destino: 'ACONDICIONADO',
    cantidad: 20,
    motivo: 'UAT TEST 3'
  }, { 'Idempotency-Key': `uat-3-${runId}` })
  console.log('Status:', r4.status)
  if (r4.status >= 400) console.log('Error:', r4.data)
  
  const s4 = await apiGet(`/productos/${PRODUCTO_ID}/stock`)
  console.log('Result:', JSON.stringify(s4.data.lotes.find(l => l.id === LOTE_ID), null, 2))

  // 5. Crear lote nuevo
  console.log('\\n5. Crear lote nuevo')
  const r5 = await apiPost(`/productos/${PRODUCTO_ID}/stock/lotes`, {
    numero: 'LOTE-UAT-' + Date.now(),
    fechaProduccion: new Date().toISOString(),
    fechaVencimiento: new Date(Date.now() + 86400000).toISOString()
  })
  console.log('Status:', r5.status)
  console.log('Result:', JSON.stringify(r5.data, null, 2))
  const NUEVO_LOTE_ID = r5.data.id

  // 6. Verificar movimientos
  console.log('\\n6. Verificar movimientos')
  const r6 = await apiGet(`/stock/movimientos`)
  const movs = Array.isArray(r6.data) ? r6.data : (r6.data.movimientos || [])
  const recentMovs = movs.filter(m => m.productoId === PRODUCTO_ID || (m.lote && m.lote.id === LOTE_ID) || (m.loteId === LOTE_ID)).slice(0, 5)
  console.log('Movimientos recientes:')
  recentMovs.forEach(m => console.log(`- ${m.tipo}: Cantidad ${m.cantidad} (Origen: ${m.origen?.codigo || m.origenId || 'N/A'} -> Destino: ${m.destino?.codigo || m.destinoId || 'N/A'})`))

  // 7. Restaurar a 0
  console.log('\\n7. Restaurar a 0')
  const r7 = await apiPatch(`/productos/${PRODUCTO_ID}/stock/lotes/${LOTE_ID}/ajuste`, {
    ubicacionId: UBICACION_DEPOSITO,
    cantidadFinal: 0,
    motivo: 'UAT RESTORE'
  }, { 'Idempotency-Key': `uat-res-1-${runId}` })
  
  const r8 = await apiPatch(`/productos/${PRODUCTO_ID}/stock/lotes/${LOTE_ID}/ajuste`, {
    ubicacionId: UBICACION_ACONDICIONADO,
    cantidadFinal: 0,
    motivo: 'UAT RESTORE'
  }, { 'Idempotency-Key': `uat-res-2-${runId}` })
  
  const s7 = await apiGet(`/productos/${PRODUCTO_ID}/stock`)
  console.log('Final Result Lote Original:', JSON.stringify(s7.data.lotes.find(l => l.id === LOTE_ID), null, 2))
  console.log('Final Result Lote Nuevo:', JSON.stringify(s7.data.lotes.find(l => l.id === NUEVO_LOTE_ID), null, 2))

}
run().catch(console.error)
