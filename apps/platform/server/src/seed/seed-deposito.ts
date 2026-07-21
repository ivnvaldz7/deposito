import 'dotenv/config'
import { Categoria, Mercado, platformDb } from '@platform/db'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { normalizeProductName } from '../deposito/lib/producto-catalogo'

// ─── Types ──────────────────────────────────────────────────────────────────

type CategoriaKey = 'droga' | 'frasco' | 'etiqueta' | 'estuche'

interface ProductEntry {
  nombreCompleto: string
  categoria: CategoriaKey
  cantidad?: number
  mercado?: string
  unidadesPorCaja?: number
  cantidadCajas?: number
  articulo?: string
}

// ─── CSV parsing ────────────────────────────────────────────────────────────

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

// ─── Name parser ────────────────────────────────────────────────────────────

/** Extract volumen and unidad from the end of a product name */
function parseVolumen(nombre: string): { base: string; volumen?: number; unidad?: string } {
  const match = nombre.match(/^(.+?)\s+([\d,]+\.?[\d]*)\s*(ML|L|GR|G|KG|MG|CM|MM)?$/i)
  if (match) {
    const base = match[1].trim()
    const vol = parseFloat(match[2].replace(',', '.'))
    const unidad = (match[3] || '').toLowerCase() || undefined
    if (!isNaN(vol)) return { base, volumen: vol, unidad }
  }
  // Try without space before unit: "5L", "35GR"
  const match2 = nombre.match(/^(.+?)\s+([\d,]+\.?[\d]*)(ML|L|GR|G|KG|MG|CM|MM)$/i)
  if (match2) {
    const base = match2[1].trim()
    const vol = parseFloat(match2[2].replace(',', '.'))
    const unidad = (match2[3] || '').toLowerCase()
    if (!isNaN(vol)) return { base, volumen: vol, unidad }
  }
  return { base: nombre }
}

// ─── Product creation ──────────────────────────────────────────────────────

async function ensureProduct(
  nombreCompleto: string,
  categoria: Categoria,
  nombreBase?: string,
  volumen?: number | null,
  unidad?: string | null,
  variante?: string | null,
): Promise<string | null> {
  const normalized = normalizeProductName(nombreCompleto)
  const cat = categoria as Categoria

  // Check if exists
  const existing = await (platformDb as any).depositoProducto.findUnique({
    where: { nombreCompleto_categoria: { nombreCompleto: normalized, categoria: cat } },
  })
  if (existing) {
    return existing.id
  }

  const parsed = parseVolumen(normalized)
  const base = nombreBase ? normalizeProductName(nombreBase) : parsed.base
  const vol = volumen ?? parsed.volumen ?? null
  const uni = unidad ?? parsed.unidad ?? null

  try {
    const product = await (platformDb as any).depositoProducto.create({
      data: {
        nombreBase: base,
        volumen: vol !== null && !isNaN(Number(vol)) ? vol : null,
        unidad: uni ?? null,
        variante: variante ?? null,
        categoria: cat,
        nombreCompleto: normalized,
        activo: true,
      },
    })
    console.log(`  ✅ ${categoria}: ${normalized}`)
    return product.id
  } catch (err: any) {
    // P2002 = unique constraint violation (race condition)
    if (err.code === 'P2002') {
      const existing2 = await (platformDb as any).depositoProducto.findUnique({
        where: { nombreCompleto_categoria: { nombreCompleto: normalized, categoria: cat } },
      })
      return existing2?.id ?? null
    }
    console.error(`  ❌ Error creating ${normalized}:`, err.message)
    return null
  }
}

// ─── Category-specific seeders ─────────────────────────────────────────────

async function seedDrogas(rows: string[][]): Promise<void> {
  console.log('\n📦 Drogas...')
  let count = 0
  for (let i = 1; i < rows.length; i++) {
    const [producto, cantidadStr] = rows[i]
    if (!producto || producto.startsWith('///') || producto.startsWith('---')) continue

    const cantidad = parseInt(cantidadStr, 10) || 0
    const normalized = normalizeProductName(producto)
    const parsed = parseVolumen(normalized)

    const productId = await ensureProduct(normalized, Categoria.droga, parsed.base, parsed.volumen, parsed.unidad)
    if (!productId) continue

    // Create/update inventario
    await (platformDb as any).inventarioDroga.upsert({
      where: { nombre_lote: { nombre: normalized, lote: '' } },
      update: { cantidad },
      create: {
        nombre: normalized,
        lote: '',
        cantidad,
        productoId: productId,
      },
    })
    count++
  }
  console.log(`  → ${count} drogas procesadas`)
}

async function seedFrascos(rows: string[][]): Promise<void> {
  console.log('\n📦 Frascos...')
  let count = 0
  for (let i = 1; i < rows.length; i++) {
    const [articulo, frascosStr, cantidadStr, totalStr] = rows[i]
    if (!articulo) continue

    const unidadesPorCaja = parseInt(frascosStr, 10) || 0
    const cantidadCajas = parseInt(cantidadStr?.replace(',', '.') ?? '0', 10) || 0
    const total = parseInt(totalStr?.replace(',', '.') ?? '0', 10) || 0
    const normalized = normalizeProductName(articulo)
    const parsed = parseVolumen(normalized)

    const productId = await ensureProduct(normalized, Categoria.frasco, parsed.base, parsed.volumen, parsed.unidad)
    if (!productId) continue

    // Upsert inventario frasco
    await (platformDb as any).inventarioFrasco.upsert({
      where: { articulo: normalized },
      update: { unidadesPorCaja, cantidadCajas, total, productoId: productId },
      create: {
        articulo: normalized,
        unidadesPorCaja,
        cantidadCajas,
        total,
        productoId: productId,
      },
    })
    count++
  }
  console.log(`  → ${count} frascos procesados`)
}

async function seedEtiquetas(rows: string[][]): Promise<void> {
  console.log('\n📦 Etiquetas...')
  let count = 0

  // This CSV has multiple markets side-by-side
  // Sections: ARGENTINA (col A-B), COLOMBIA (col D-E), MEXICO (col G-H),
  //           BOLIVIA (col A-B inner), ECUADOR (col A-B inner), PARAGUAY (col A-B inner)
  // The sections are separated by header rows like "BOLIVIA,CANTIDAD"

  const mercadoMapping: Record<string, Mercado> = {
    'COLOMBIA': Mercado.colombia,
    'MEXICO': Mercado.mexico,
    'BOLIVIA': Mercado.bolivia,
    'ECUADOR': Mercado.ecuador,
    'PARAGUAY': Mercado.paraguay,
    'NO EXPORTABLE': Mercado.no_exportable,
  }

  // Phase 1: Argentina (default) articles — cols A-B, rows 1-17
  let rowIdx = 1
  for (; rowIdx < rows.length; rowIdx++) {
    const [articulo, cantidadStr] = rows[rowIdx]
    if (!articulo || mercadoMapping[articulo.trim().toUpperCase()] || articulo.startsWith('///')) break
    if (articulo === 'ARTÍCULO') continue

    const cantidad = parseInt(cantidadStr?.replace(',', '.') ?? '0', 10) || 0
    const normalized = normalizeProductName(articulo)
    const parsed = parseVolumen(normalized)

    const productId = await ensureProduct(normalized, Categoria.etiqueta, parsed.base, parsed.volumen, parsed.unidad)
    if (!productId) continue

    // Argentina = no mercado specified or null (default market)
    await createOrUpdateInventarioEtiqueta(normalized, productId, undefined as any, cantidad)
    count++
  }

  // Phase 2: Scan for market sections
  for (; rowIdx < rows.length; rowIdx++) {
    const [col0, col1] = rows[rowIdx]
    if (!col0 || col0.startsWith('///') || col0.startsWith('---')) continue

    const upper = col0.trim().toUpperCase()

    // Check if this row starts a new market section
    if (mercadoMapping[upper] || upper === '') {
      // This is a market header or empty separator
      const mercado = mercadoMapping[upper]
      if (!mercado) continue

      // Read articles for this market
      rowIdx++
      while (rowIdx < rows.length) {
        const [art, cant] = rows[rowIdx]
        if (!art || mercadoMapping[art.trim().toUpperCase()] || art.startsWith('///')) break
        if (art === 'ARTÍCULO' || art.trim() === '' || art === 'ARTÍCULO' || art.startsWith('ARTÍCULO')) {
          rowIdx++
          continue
        }

        const cantidad = parseInt(cant?.replace(',', '.') ?? '0', 10) || 0
        const normalized = normalizeProductName(art)
        const parsed = parseVolumen(normalized)

        const productId = await ensureProduct(normalized, Categoria.etiqueta, parsed.base, parsed.volumen, parsed.unidad)
        if (!productId) { rowIdx++; continue }

        await createOrUpdateInventarioEtiqueta(normalized, productId, mercado, cantidad)
        count++
        rowIdx++
      }
      continue
    }
  }

  console.log(`  → ${count} etiquetas procesadas`)
}

async function createOrUpdateInventarioEtiqueta(
  articulo: string,
  productoId: string,
  mercado: Mercado,
  cantidad: number,
): Promise<void> {
  const normalized = normalizeProductName(articulo)
  const key = mercado
    ? `${normalized}::${mercado}`
    : normalized

  // Check for existing record by finding it (no unique constraint on articulo alone for default market)
  const existing = await (platformDb as any).inventarioEtiqueta.findFirst({
    where: mercado
      ? { articulo: normalized, mercado }
      : { articulo: normalized, mercado: null },
  })

  if (existing) {
    await (platformDb as any).inventarioEtiqueta.update({
      where: { id: existing.id },
      data: { cantidad, productoId },
    })
  } else {
    await (platformDb as any).inventarioEtiqueta.create({
      data: {
        articulo: normalized,
        mercado: mercado ?? null,
        cantidad,
        productoId,
      },
    })
  }
}

async function seedEstuches(rows: string[][]): Promise<void> {
  console.log('\n📦 Estuches...')
  let count = 0

  const mercadoMapping: Record<string, Mercado> = {
    'COLOMBIA': Mercado.colombia,
    'MEXICO': Mercado.mexico,
    'BOLIVIA': Mercado.bolivia,
    'ECUADOR': Mercado.ecuador,
    'PARAGUAY': Mercado.paraguay,
    'NO EXPORTABLE': Mercado.no_exportable,
  }

  // Phase 1: Argentina cols A-B, plus inline Colombia (D-E), Mexico (G-H), No Exportable (D-E later)
  let rowIdx = 1
  for (; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    const [articulo, cantidadStr] = row
    if (!articulo || mercadoMapping[articulo.trim().toUpperCase()] || articulo.startsWith('///')) break
    if (articulo === 'ARTÍCULO') continue

    // Argentina
    const cantidad = parseInt(cantidadStr?.replace(',', '.') ?? '0', 10) || 0
    const normalized = normalizeProductName(articulo)
    const parsed = parseVolumen(normalized)

    const productId = await ensureProduct(normalized, Categoria.estuche, parsed.base, parsed.volumen, parsed.unidad)
    if (!productId) continue

    await createOrUpdateInventarioEstuche(normalized, productId, undefined as any, cantidad)
    count++

    // Colombia inline (col D-E)
    const colArticulo = row[3]
    const colCantidad = row[4]
    if (colArticulo && !mercadoMapping[colArticulo.trim().toUpperCase()] && colArticulo !== 'ARTÍCULO') {
      const colNorm = normalizeProductName(colArticulo)
      const colCant = parseInt(colCantidad?.replace(',', '.') ?? '0', 10) || 0
      const colParsed = parseVolumen(colNorm)
      const colProductId = await ensureProduct(colNorm, Categoria.estuche, colParsed.base, colParsed.volumen, colParsed.unidad)
      if (colProductId) {
        await createOrUpdateInventarioEstuche(colNorm, colProductId, Mercado.colombia, colCant)
        count++
      }
    }

    // Mexico inline (col G-H)
    const mexArticulo = row[6]
    const mexCantidad = row[7]
    if (mexArticulo && !mercadoMapping[mexArticulo.trim().toUpperCase()] && mexArticulo !== 'ARTÍCULO') {
      const mexNorm = normalizeProductName(mexArticulo)
      const mexCant = parseInt(mexCantidad?.replace(',', '.') ?? '0', 10) || 0
      const mexParsed = parseVolumen(mexNorm)
      const mexProductId = await ensureProduct(mexNorm, Categoria.estuche, mexParsed.base, mexParsed.volumen, mexParsed.unidad)
      if (mexProductId) {
        await createOrUpdateInventarioEstuche(mexNorm, mexProductId, Mercado.mexico, mexCant)
        count++
      }
    }
  }

  // Phase 2: Market sections (No Exportable, Ecuador, Bolivia, Paraguay)
  for (; rowIdx < rows.length; rowIdx++) {
    const [col0] = rows[rowIdx]
    if (!col0) continue

    const upper = col0.trim().toUpperCase().replace(/^ART[ÍI]CULO\s+/, '').trim()

    let mercado: Mercado | null = null
    for (const [key, value] of Object.entries(mercadoMapping)) {
      if (upper.includes(key)) { mercado = value; break }
    }
    if (!mercado) continue

    // Read articles for this market
    rowIdx++
    while (rowIdx < rows.length) {
      const row = rows[rowIdx]
      const [art, cant] = row
      if (!art || art.startsWith('///') || art.startsWith('---')) break

      const artUpper = art.trim().toUpperCase().replace(/^ART[ÍI]CULO\s+/, '').trim()
      let nextMercado: Mercado | null = null
      for (const [key, value] of Object.entries(mercadoMapping)) {
        if (artUpper.includes(key)) { nextMercado = value; break }
      }
      if (nextMercado) { rowIdx--; break }

      if (art === 'ARTÍCULO' || art.trim() === '') { rowIdx++; continue }

      const cantidad = parseInt(cant?.replace(',', '.') ?? '0', 10) || 0
      const normalized = normalizeProductName(art)
      const parsed = parseVolumen(normalized)

      const productId = await ensureProduct(normalized, Categoria.estuche, parsed.base, parsed.volumen, parsed.unidad)
      if (!productId) { rowIdx++; continue }

      await createOrUpdateInventarioEstuche(normalized, productId, mercado, cantidad)
      count++
      rowIdx++
    }
  }

  console.log(`  → ${count} estuches procesados`)
}

async function createOrUpdateInventarioEstuche(
  articulo: string,
  productoId: string,
  mercado: Mercado,
  cantidad: number,
): Promise<void> {
  const normalized = normalizeProductName(articulo)
  const existing = await (platformDb as any).inventarioEstuche.findFirst({
    where: mercado
      ? { articulo: normalized, mercado }
      : { articulo: normalized, mercado: null },
  })

  if (existing) {
    await (platformDb as any).inventarioEstuche.update({
      where: { id: existing.id },
      data: { cantidad, productoId },
    })
  } else {
    await (platformDb as any).inventarioEstuche.create({
      data: {
        articulo: normalized,
        mercado: mercado ?? null,
        cantidad,
        productoId,
      },
    })
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Seed: Depósito productos e inventario\n')
  console.log('Conectando a la base de datos...')

  const dataDir = resolve(__dirname, 'data')

  // 1. Drogas
  const drogasText = readFileSync(resolve(dataDir, 'drogas.csv'), 'utf-8')
  await seedDrogas(parseCSV(drogasText))

  // 2. Frascos
  const frascosText = readFileSync(resolve(dataDir, 'frascos.csv'), 'utf-8')
  await seedFrascos(parseCSV(frascosText))

  // 3. Etiquetas
  const etiquetasText = readFileSync(resolve(dataDir, 'etiquetas.csv'), 'utf-8')
  await seedEtiquetas(parseCSV(etiquetasText))

  // 4. Estuches
  const estuchesText = readFileSync(resolve(dataDir, 'estuches.csv'), 'utf-8')
  await seedEstuches(parseCSV(estuchesText))

  console.log('\n✅ Seed completado exitosamente')
}

main().catch((err) => {
  console.error('❌ Error en seed:', err)
  process.exit(1)
})
