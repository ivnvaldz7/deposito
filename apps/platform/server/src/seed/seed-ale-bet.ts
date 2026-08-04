import 'dotenv/config'
import { platformDb as prisma } from '@platform/db'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildAleBetSeedPlan } from './seed-ale-bet-data'

const STOCK_MINIMO_DEFAULT = 100

type ProductoRow = { nombre: string; lote: string; total: number }

function parseCSV(text: string): string[][] {
  return text.split('\n').filter(Boolean).map((line) => {
    const row: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line.trim()) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { row.push(current.trim()); current = ''; continue }
      current += char
    }
    row.push(current.trim())
    return row
  })
}

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I').replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N').replace(/[^A-Z0-9\s-]/g, '').replace(/\s+/g, ' ').trim()
}

function generateSku(nombre: string, index: number): string {
  const prefix = normalizeName(nombre).split(/\s+/).slice(0, 3).map((part) => part.slice(0, 4)).join('-')
  return `${prefix}-${String(index).padStart(3, '0')}`
}

function parseProductos(rows: string[][]): ProductoRow[] {
  const result: ProductoRow[] = []
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    for (const offset of [0, 4]) {
      const nombre = row[offset]?.trim()
      if (!nombre || nombre.startsWith('---') || nombre.startsWith('///')) continue
      const total = Number.parseInt(row[offset + 2] ?? '', 10)
      if (!Number.isInteger(total) || total < 0) throw new Error(`TOTAL inválido en ale-bet-productos.csv fila ${index + 1}`)
      result.push({ nombre, lote: row[offset + 1]?.trim() ?? '', total })
    }
  }
  return result
}

async function main() {
  console.log('🌱 Seed: Ale-Bet productos + lotes\n')
  const dataDir = resolve(__dirname, 'data')
  const movimientoPlan = buildAleBetSeedPlan(parseCSV(readFileSync(resolve(dataDir, 'ale-bet-movimientos.csv'), 'utf-8')))
  const productoRows = parseProductos(parseCSV(readFileSync(resolve(dataDir, 'ale-bet-productos.csv'), 'utf-8')))
  const unidadesPorCajaByName = new Map(movimientoPlan.productos.map((producto) => [producto.nombre, producto.unidadesPorCaja]))

  const unresolvedProducts = [...new Set(productoRows.map((row) => row.nombre).filter((nombre) => !unidadesPorCajaByName.has(nombre)))].sort()
  if (unresolvedProducts.length > 0) {
    throw new Error(`Seed Ale-Bet bloqueado: CAJA explícita requerida para productos sin correspondencia inequívoca en ale-bet-movimientos.csv: ${unresolvedProducts.join(', ')}`)
  }

  console.log(`📦 ${movimientoPlan.productos.length} productos con CAJA verificada`)
  const productMap = new Map<string, string>()
  for (const [index, source] of movimientoPlan.productos.entries()) {
    const existing = await prisma.producto.findFirst({ where: { nombre: source.nombre } })
    if (existing) {
      if (existing.unidadesPorCaja !== source.unidadesPorCaja) {
        throw new Error(`Seed Ale-Bet bloqueado: ${source.nombre} existe con unidadesPorCaja=${existing.unidadesPorCaja}, CSV CAJA=${source.unidadesPorCaja}`)
      }
      productMap.set(source.nombre, existing.id)
      continue
    }
    const producto = await prisma.producto.create({
      data: { nombre: source.nombre, sku: generateSku(source.nombre, index + 1), stockMinimo: STOCK_MINIMO_DEFAULT, unidadesPorCaja: source.unidadesPorCaja, activo: true },
    })
    productMap.set(source.nombre, producto.id)
  }

  const now = new Date()
  const fechaProduccion = new Date(now); fechaProduccion.setMonth(fechaProduccion.getMonth() - 6)
  const fechaVencimiento = new Date(now); fechaVencimiento.setMonth(fechaVencimiento.getMonth() + 18)
  const movimientoKeys = new Set(movimientoPlan.lotes.map((row) => `${row.nombre}|${row.lote}`))

  for (const row of movimientoPlan.lotes) {
    const productoId = productMap.get(row.nombre)
    if (!productoId) throw new Error(`Producto no encontrado durante seed: ${row.nombre}`)
    const existing = await prisma.lote.findFirst({ where: { productoId, numero: row.lote } })
    if (existing) continue
    await prisma.lote.create({ data: { numero: row.lote, productoId, cajas: row.cajas, sueltos: row.sueltos, fechaProduccion, fechaVencimiento, activo: true } })
  }

  for (const row of productoRows) {
    if (row.total === 0 || movimientoKeys.has(`${row.nombre}|${row.lote}`)) continue
    const productoId = productMap.get(row.nombre)
    const unidadesPorCaja = unidadesPorCajaByName.get(row.nombre)
    if (!productoId || !unidadesPorCaja) throw new Error(`CAJA explícita requerida para ${row.nombre}`)
    const existing = await prisma.lote.findFirst({ where: { productoId, numero: row.lote } })
    if (existing) continue
    await prisma.lote.create({
      data: { numero: row.lote, productoId, cajas: Math.floor(row.total / unidadesPorCaja), sueltos: row.total % unidadesPorCaja, fechaProduccion, fechaVencimiento, activo: true },
    })
  }

  console.log(`✅ Seed Ale-Bet preparado con ${movimientoPlan.lotes.length} lotes del CSV MOVIMIENTOS`)
}

main().catch((error) => { console.error('❌ Error en seed Ale-Bet:', error); process.exit(1) })
