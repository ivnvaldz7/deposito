/**
 * Demo script: generates two ventas-by-client PDFs for visual inspection.
 *
 * A — mensual: Veterinaria Ñandú S.A., encoding validation (ñ + accents),
 *              4 products with varied cajas/sueltos/unidadesPorCaja combos.
 * B — anual:   Veterinaria Oeste S.A., 5 products, 6 active months; enough
 *              rows to verify layout and pagination behavior.
 *
 * Output → output/pdf/  (relative to the project root, same as remito demo).
 * Run:  npx tsx src/scripts/generate-alebet-ventas-pdf-demo.ts
 *       (from apps/platform/server)
 */

import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import PDFDocument from 'pdfkit'
import { renderVentasPdf, type VentasPdfDocument, type VentasPdfInput } from '../routes/ale-bet/ventas-pdf'

const OUTPUT_DIR = resolve(process.cwd(), '../../../output/pdf')
mkdirSync(OUTPUT_DIR, { recursive: true })

// Fixed generation date for reproducible inspection.
const GENERADO = '07 de agosto de 2026'

// ─── A — MENSUAL ─────────────────────────────────────────────────────────────
// Fixtures chosen to validate:
//   • ñ and accented characters in the client name (encoding)
//   • sueltos:0 when divisible by unidadesPorCaja
//   • cajas:0 when fewer than one full box
//   • long product name → ellipsis in the PRODUCTO column

const mensualInput: VentasPdfInput = {
  modo: 'mensual',
  year: 2026,
  month: 7,
  clienteNombre: 'Veterinaria Ñandú S.A.',
  cuit: '30-88776655-4',
  generado: GENERADO,
  resumen: {
    pedidosDespachados: 8,
    productosDistintos: 4,
    unidadesTotales: 2024,
  },
  productos: [
    {
      nombre: 'Amoxicilina + Ácido Clavulánico 250mg/62.5mg — Blíster 10 comprimidos',
      sku: 'AMOX-250',
      unidadesPorCaja: 24,
      // 480 ÷ 24 = 20 cajas, 0 sueltos
      cajas: 20,
      sueltos: 0,
      unidades: 480,
    },
    {
      nombre: 'Cefalexina 500mg Cápsulas',
      sku: 'CEFA-500',
      unidadesPorCaja: 10,
      // 7 ÷ 10 = 0 cajas, 7 sueltos
      cajas: 0,
      sueltos: 7,
      unidades: 7,
    },
    {
      nombre: 'Antiparasitario Broad-Spec Canino',
      sku: 'ANTI-BSC',
      unidadesPorCaja: 6,
      // 1491 ÷ 6 = 248 cajas, 3 sueltos
      cajas: 248,
      sueltos: 3,
      unidades: 1491,
    },
    {
      nombre: 'Ivermectina 1% Inyectable',
      sku: 'IVER-001',
      unidadesPorCaja: 12,
      // 46 ÷ 12 = 3 cajas, 10 sueltos
      cajas: 3,
      sueltos: 10,
      unidades: 46,
    },
  ],
}

// ─── B — ANUAL ───────────────────────────────────────────────────────────────
// 6 active months; 5 products; totals consistent with per-month breakdown.
// Intentionally has enough products to test the section layout.

const anualInput: VentasPdfInput = {
  modo: 'anual',
  year: 2026,
  month: null,
  clienteNombre: 'Veterinaria Oeste S.A.',
  cuit: '30-12345678-9',
  generado: GENERADO,
  resumen: {
    pedidosDespachados: 24,
    productosDistintos: 5,
    unidadesTotales: 8640,
  },
  meses: [
    { month: 1, pedidosDespachados: 6, productosDistintos: 3, unidadesTotales: 1920 },
    { month: 2, pedidosDespachados: 3, productosDistintos: 2, unidadesTotales: 720 },
    { month: 5, pedidosDespachados: 4, productosDistintos: 4, unidadesTotales: 1440 },
    { month: 7, pedidosDespachados: 5, productosDistintos: 3, unidadesTotales: 2160 },
    { month: 9, pedidosDespachados: 4, productosDistintos: 5, unidadesTotales: 1680 },
    { month: 12, pedidosDespachados: 2, productosDistintos: 2, unidadesTotales: 720 },
  ],
  productos: [
    {
      nombre: 'Amoxicilina + Ácido Clavulánico 250mg/62.5mg',
      sku: 'AMOX-250',
      unidadesPorCaja: 24,
      cajas: 120,
      sueltos: 0,
      unidades: 2880,
    },
    {
      nombre: 'Cefalexina 500mg Cápsulas',
      sku: 'CEFA-500',
      unidadesPorCaja: 10,
      cajas: 192,
      sueltos: 0,
      unidades: 1920,
    },
    {
      nombre: 'Antiparasitario Broad-Spec Canino',
      sku: 'ANTI-BSC',
      unidadesPorCaja: 6,
      cajas: 240,
      sueltos: 0,
      unidades: 1440,
    },
    {
      nombre: 'Ivermectina 1% Inyectable',
      sku: 'IVER-001',
      unidadesPorCaja: 12,
      cajas: 200,
      sueltos: 0,
      unidades: 2400,
    },
    {
      nombre: 'Paracetamol Veterinario 500mg',
      sku: 'PARA-VET',
      unidadesPorCaja: 20,
      cajas: 0,
      sueltos: 0,
      unidades: 0,
    },
  ],
}

// ─── Generate both PDFs ───────────────────────────────────────────────────────

function writePdf(filename: string, input: VentasPdfInput): void {
  const outputPath = resolve(OUTPUT_DIR, filename)
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true })
  const stream = createWriteStream(outputPath)
  doc.pipe(stream)
  renderVentasPdf(doc as unknown as VentasPdfDocument, input)
  doc.end()
  stream.on('finish', () => {
    process.stdout.write(`Generated ${outputPath}\n`)
  })
}

writePdf('alebet-ventas-pdf-demo-mensual.pdf', mensualInput)
writePdf('alebet-ventas-pdf-demo-anual.pdf', anualInput)
