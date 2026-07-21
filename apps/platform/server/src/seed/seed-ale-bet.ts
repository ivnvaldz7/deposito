import 'dotenv/config'
import { platformDb as prisma } from '@platform/db'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ─── Constants ───────────────────────────────────────────────────────────────

const UNIDADES_POR_CAJA = 15
const STOCK_MINIMO_DEFAULT = 100

// ─── Types ───────────────────────────────────────────────────────────────────

interface MovimientoRow {
  nombre: string
  lote: string
  caja: number   // units per box (from CSV)
  cant: number   // number of boxes
  suelto: number // loose units
  total: number  // caja * cant + suelto
}

interface ProductoRow {
  nombre: string
  lote: string
  total: number
}

// ─── CSV parsing (reused from seed-deposito.ts) ──────────────────────────────

function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter(Boolean)
  return lines.map((line) => {
    const row: string[] = []
    let current = ''
    let inQuotes = false

    for (const ch of line.trim()) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { row.push(current.trim()); current = ''; continue }
      current += ch
    }
    row.push(current.trim())
    return row
  })
}

// ─── Name normalization ──────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O')
    .replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/Ñ/g, 'N')
    .replace(/[^A-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function generateSku(nombre: string, index: number): string {
  const normalized = normalizeName(nombre)
  const parts = normalized.split(/\s+/)

  // Take first 3 significant parts, abbreviate to max 4 chars each
  const skuParts = parts.slice(0, 3).map((p) => p.replace(/[^A-Z0-9]/g, '').slice(0, 4))
  const prefix = skuParts.join('-')
  const suffix = String(index).padStart(3, '0')

  return `${prefix}-${suffix}`
}

// ─── Parse MOVIMIENTOS CSV ───────────────────────────────────────────────────

function parseMovimientos(rows: string[][]): MovimientoRow[] {
  const result: MovimientoRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const [nombre, lote, cajaStr, cantStr, sueltoStr, totalStr] = rows[i]
    if (!nombre || nombre.startsWith('---') || nombre.startsWith('///')) continue

    const caja = parseInt(cajaStr, 10) || 0
    const cant = parseInt(cantStr, 10) || 0
    const suelto = parseInt(sueltoStr, 10) || 0
    const total = parseInt(totalStr, 10) || 0

    if (total === 0) {
      // Skip zero-stock entries but log them
      console.log(`  ⚠️  ${nombre} (${lote}): stock 0, omitido`)
      continue
    }

    result.push({ nombre: nombre.trim(), lote: lote.trim(), caja, cant, suelto, total })
  }

  return result
}

// ─── Parse PRODUCTO CSV (two-column layout) ──────────────────────────────────

function parseProductos(rows: string[][]): ProductoRow[] {
  const result: ProductoRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]

    // Left side: [PRODUCTO, LOTE, TOTAL]
    if (row[0] && !row[0].startsWith('---') && !row[0].startsWith('///')) {
      const total = parseInt(row[2], 10) || 0
      if (total > 0) {
        result.push({ nombre: row[0].trim(), lote: row[1].trim(), total })
      }
    }

    // Right side: starts at index 4 (after empty separator columns)
    if (row.length > 4 && row[4] && !row[4].startsWith('---') && !row[4].startsWith('///')) {
      const total = parseInt(row[6], 10) || 0
      if (total > 0) {
        result.push({ nombre: row[4].trim(), lote: row[5].trim(), total })
      }
    }
  }

  return result
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seed: Ale-Bet productos + lotes\n')
  console.log('Conectando a la base de datos...')

  const dataDir = resolve(__dirname, 'data')

  // 1. Parse CSVs
  console.log('\n📄 Leyendo MOVIMIENTOS...')
  const movText = readFileSync(resolve(dataDir, 'ale-bet-movimientos.csv'), 'utf-8')
  const movRows = parseMovimientos(parseCSV(movText))
  console.log(`  → ${movRows.length} movimientos con stock`)

  console.log('\n📄 Leyendo PRODUCTOS...')
  const prodText = readFileSync(resolve(dataDir, 'ale-bet-productos.csv'), 'utf-8')
  const prodRows = parseProductos(parseCSV(prodText))
  console.log(`  → ${prodRows.length} productos con stock`)

  // 2. Merge: MOVIMIENTOS is primary, PRODUCTOS provides extras not in MOVIMIENTOS
  // Build a set of (nombre, lote) from movimientos
  const movKeySet = new Set(movRows.map((r) => `${r.nombre}|${r.lote}`))

  // All unique product names across both sources
  const allProductNames = new Set<string>()
  for (const r of movRows) allProductNames.add(r.nombre)
  for (const r of prodRows) {
    if (!movKeySet.has(`${r.nombre}|${r.lote}`)) {
      allProductNames.add(r.nombre)
    }
  }

  const uniqueNames = [...allProductNames].sort()
  console.log(`\n📦 ${uniqueNames.length} productos únicos a crear`)

  // 3. Create Productos
  const productMap = new Map<string, string>() // nombre → id
  let createdCount = 0
  let skippedCount = 0

  for (let i = 0; i < uniqueNames.length; i++) {
    const nombre = uniqueNames[i]
    const sku = generateSku(nombre, i + 1)

    const existing = await prisma.producto.findFirst({
      where: { nombre },
    })

    if (existing) {
      productMap.set(nombre, existing.id)
      skippedCount++
      continue
    }

    try {
      const producto = await prisma.producto.create({
        data: {
          nombre,
          sku,
          stockMinimo: STOCK_MINIMO_DEFAULT,
          activo: true,
        },
      })
      productMap.set(nombre, producto.id)
      createdCount++
      console.log(`  ✅ ${sku} → ${nombre}`)
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Race condition — try find
        const existing2 = await prisma.producto.findFirst({
          where: { nombre },
        })
        if (existing2) {
          productMap.set(nombre, existing2.id)
          skippedCount++
          continue
        }
      }
      console.error(`  ❌ Error creando ${nombre}: ${err.message}`)
    }
  }

  console.log(`\n  Creados: ${createdCount}, Ya existían: ${skippedCount}`)

  // 4. Create Lotes from MOVIMIENTOS
  console.log('\n📋 Creando lotes desde movimientos...')
  let loteCreated = 0
  let loteSkipped = 0

  for (const row of movRows) {
    const productoId = productMap.get(row.nombre)
    if (!productoId) {
      console.error(`  ❌ Producto no encontrado: ${row.nombre}`)
      continue
    }

    // Check if lote already exists for this producto + numero
    const existing = await prisma.lote.findFirst({
      where: { productoId, numero: row.lote },
    })
    if (existing) {
      loteSkipped++
      continue
    }

    // Normalize: convert actual box/loose to system UNIDADES_POR_CAJA convention
    const totalUnits = row.total
    const normalizedCajas = Math.floor(totalUnits / UNIDADES_POR_CAJA)
    const normalizedSueltos = totalUnits % UNIDADES_POR_CAJA

    // Default dates: produce 6 months ago, vence in 18 months
    const now = new Date()
    const fechaProduccion = new Date(now)
    fechaProduccion.setMonth(fechaProduccion.getMonth() - 6)

    const fechaVencimiento = new Date(now)
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + 18)

    try {
      await prisma.lote.create({
        data: {
          numero: row.lote,
          productoId,
          cajas: normalizedCajas,
          sueltos: normalizedSueltos,
          fechaProduccion,
          fechaVencimiento,
          activo: true,
        },
      })
      loteCreated++
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Race condition on unique constraint
        loteSkipped++
        continue
      }
      console.error(`  ❌ Error creando lote ${row.lote} para ${row.nombre}: ${err.message}`)
    }
  }

  // 5. Create Lotes from PRODUCTO extras (those not in MOVIMIENTOS)
  console.log('\n📋 Creando lotes desde productos adicionales...')
  for (const row of prodRows) {
    if (movKeySet.has(`${row.nombre}|${row.lote}`)) continue // already done

    const productoId = productMap.get(row.nombre)
    if (!productoId) {
      console.error(`  ❌ Producto no encontrado: ${row.nombre}`)
      continue
    }

    const existing = await prisma.lote.findFirst({
      where: { productoId, numero: row.lote },
    })
    if (existing) {
      loteSkipped++
      continue
    }

    const totalUnits = row.total
    const normalizedCajas = Math.floor(totalUnits / UNIDADES_POR_CAJA)
    const normalizedSueltos = totalUnits % UNIDADES_POR_CAJA

    const now = new Date()
    const fechaProduccion = new Date(now)
    fechaProduccion.setMonth(fechaProduccion.getMonth() - 6)
    const fechaVencimiento = new Date(now)
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + 18)

    try {
      await prisma.lote.create({
        data: {
          numero: row.lote,
          productoId,
          cajas: normalizedCajas,
          sueltos: normalizedSueltos,
          fechaProduccion,
          fechaVencimiento,
          activo: true,
        },
      })
      loteCreated++
    } catch (err: any) {
      if (err.code === 'P2002') {
        loteSkipped++
        continue
      }
      console.error(`  ❌ Error creando lote ${row.lote} para ${row.nombre}: ${err.message}`)
    }
  }

  console.log(`\n  Creados: ${loteCreated}, Ya existían: ${loteSkipped}`)

  // 6. Summary
  console.log('\n📊 Resumen:')
  const totalProductos = await prisma.producto.count()
  const totalLotes = await prisma.lote.count()
  console.log(`  Productos: ${totalProductos}`)
  console.log(`  Lotes:     ${totalLotes}`)

  console.log('\n✅ Seed Ale-Bet completado exitosamente')
}

main().catch((err) => {
  console.error('❌ Error en seed Ale-Bet:', err)
  process.exit(1)
})
