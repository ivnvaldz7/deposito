import ExcelJS from 'exceljs'
import type { Cliente, ReporteVentas } from './api'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// Brand Palette (ARGB for ExcelJS)
const COLORS = {
  primary: 'FF3D6852',
  text: 'FF111827',
  textSecondary: 'FF5F6B66',
  headerSoft: 'FFE9EFEB',
  border: 'FFD7DEDA',
  white: 'FFFFFFFF',
}

/**
 * Mini slug for download filenames
 */
export function miniSlugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function setupPrintOptions(ws: ExcelJS.Worksheet) {
  ws.pageSetup.paperSize = 9 // A4
  ws.pageSetup.orientation = 'portrait'
  ws.pageSetup.fitToPage = true
  ws.pageSetup.fitToWidth = 1
  ws.pageSetup.fitToHeight = 0
  ws.pageSetup.margins = {
    left: 0.5, right: 0.5,
    top: 0.75, bottom: 0.75,
    header: 0.3, footer: 0.3
  }
  ws.headerFooter.oddHeader = '&L&"Arial,Bold"Ale-Bet · Logística'
  ws.headerFooter.oddFooter = '&R&"Arial"Página &P de &N'
}

function applyCommonHeader(ws: ExcelJS.Worksheet, title: string, cliente: Cliente, year: number, month?: number) {
  // Title Bar
  ws.mergeCells('A1:F1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'ALE-BET · LOGÍSTICA'
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { arg: COLORS.primary } }
  titleCell.font = { color: { arg: COLORS.white }, bold: true, size: 10 }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 20

  // Main Report Title
  ws.mergeCells('A2:F2')
  const reportTitle = ws.getCell('A2')
  reportTitle.value = title
  reportTitle.font = { color: { arg: COLORS.text }, bold: true, size: 18 }
  reportTitle.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(2).height = 30

  // Metadata Block
  const generado = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())
  
  ws.getCell('A4').value = 'CLIENTE'
  ws.mergeCells('B4:F4')
  ws.getCell('B4').value = cliente.nombre
  
  ws.getCell('A5').value = 'CUIT'
  ws.mergeCells('B5:F5')
  ws.getCell('B5').value = cliente.cuit || '-'
  
  ws.getCell('A6').value = 'PERÍODO'
  ws.mergeCells('B6:F6')
  ws.getCell('B6').value = month ? `${MESES[month - 1]} ${year}` : `${year}`
  
  ws.getCell('A7').value = 'GENERADO'
  ws.mergeCells('B7:F7')
  ws.getCell('B7').value = generado

  // Style metadata
  for (let r = 4; r <= 7; r++) {
    const lbl = ws.getCell(`A${r}`)
    lbl.font = { color: { arg: COLORS.textSecondary }, bold: true, size: 9 }
    lbl.alignment = { vertical: 'middle' }
    
    const val = ws.getCell(`B${r}`)
    val.font = { color: { arg: COLORS.text }, bold: r === 4, size: r === 4 ? 12 : 10 }
    val.alignment = { vertical: 'middle' }
    
    // Bottom border for metadata rows
    for (let c = 1; c <= 6; c++) {
      ws.getCell(r, c).border = { bottom: { style: 'thin', color: { arg: COLORS.border } } }
    }
    ws.getRow(r).height = 22
  }
}

function applyResumenMetrics(ws: ExcelJS.Worksheet, reporte: ReporteVentas) {
  ws.mergeCells('A9:F9')
  const resTitle = ws.getCell('A9')
  resTitle.value = 'RESUMEN'
  resTitle.font = { color: { arg: COLORS.textSecondary }, bold: true, size: 10 }
  resTitle.alignment = { vertical: 'middle' }
  ws.getRow(9).height = 24

  const metrics = [
    { label: 'PEDIDOS DESPACHADOS', value: reporte.pedidosDespachados, rangeLabel: 'A10:B10', rangeValue: 'A11:B12' },
    { label: 'PRODUCTOS', value: reporte.productosDistintos, rangeLabel: 'C10:D10', rangeValue: 'C11:D12' },
    { label: 'UNIDADES', value: reporte.unidadesTotales, rangeLabel: 'E10:F10', rangeValue: 'E11:F12' }
  ]

  metrics.forEach(m => {
    ws.mergeCells(m.rangeLabel)
    const lblCell = ws.getCell(m.rangeLabel.split(':')[0])
    lblCell.value = m.label
    lblCell.font = { color: { arg: COLORS.textSecondary }, bold: true, size: 9 }
    lblCell.alignment = { horizontal: 'center', vertical: 'middle' }
    
    ws.mergeCells(m.rangeValue)
    const valCell = ws.getCell(m.rangeValue.split(':')[0])
    valCell.value = m.value
    valCell.font = { color: { arg: COLORS.text }, bold: true, size: 18 }
    valCell.numFmt = '#,##0'
    valCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // Apply borders and fills to the metric block
    const cols = [m.rangeLabel.charCodeAt(0) - 64, m.rangeLabel.charCodeAt(3) - 64]
    for (let r = 10; r <= 12; r++) {
      for (let c = cols[0]; c <= cols[1]; c++) {
        const cell = ws.getCell(r, c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { arg: COLORS.headerSoft } }
        cell.border = {
          top: { style: 'thin', color: { arg: COLORS.border } },
          left: { style: 'thin', color: { arg: COLORS.border } },
          bottom: { style: 'thin', color: { arg: COLORS.border } },
          right: { style: 'thin', color: { arg: COLORS.border } },
        }
      }
    }
  })
}

function buildMensualSheet(wb: ExcelJS.Workbook, cliente: Cliente, reporte: ReporteVentas) {
  const ws = wb.addWorksheet('Ventas', { properties: { tabColor: { arg: COLORS.primary } } })
  setupPrintOptions(ws)
  
  ws.columns = [
    { width: 38 }, // A: Producto
    { width: 22 }, // B: SKU
    { width: 11 }, // C: U/CAJA
    { width: 11 }, // D: CAJAS
    { width: 11 }, // E: SUELTOS
    { width: 14 }  // F: UNIDADES
  ]

  applyCommonHeader(ws, 'REPORTE DE VENTAS POR CLIENTE', cliente, reporte.year, reporte.modo === 'mensual' ? reporte.month : undefined)
  applyResumenMetrics(ws, reporte)

  // Detalle Table Title
  ws.mergeCells('A14:F14')
  const tableTitle = ws.getCell('A14')
  tableTitle.value = 'DETALLE DE PRODUCTOS'
  tableTitle.font = { color: { arg: COLORS.textSecondary }, bold: true, size: 10 }
  tableTitle.alignment = { vertical: 'bottom' }
  ws.getRow(14).height = 30

  // Table Headers
  const headers = ['PRODUCTO', 'SKU', 'U/CAJA', 'CAJAS', 'SUELTOS', 'UNIDADES']
  const headerRow = ws.getRow(16)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { color: { arg: COLORS.white }, bold: true, size: 9 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { arg: COLORS.primary } }
    cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'right', indent: i < 2 ? 1 : 0 }
  })
  headerRow.height = 24

  // Table Data
  let startRow = 17
  reporte.productos.forEach((p, idx) => {
    const row = ws.getRow(startRow + idx)
    row.values = [p.nombre, p.sku, p.unidadesPorCaja, p.cajas, p.sueltos, p.unidades]
    row.height = 20

    row.eachCell((cell, colNum) => {
      cell.font = { color: { arg: colNum === 1 ? COLORS.text : COLORS.textSecondary }, size: 10, bold: colNum === 1 }
      cell.alignment = { vertical: 'middle', horizontal: colNum < 3 ? 'left' : 'right', indent: colNum < 3 ? 1 : 0 }
      cell.border = { bottom: { style: 'thin', color: { arg: COLORS.border } } }
      if (colNum > 2) cell.numFmt = '#,##0'
    })
  })

  // AutoFilter & Freeze Panes
  ws.autoFilter = { from: { row: 16, column: 1 }, to: { row: 16, column: 6 } }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 16 }]
  ws.pageSetup.printTitlesRow = '1:16'
}

function buildAnualSheets(wb: ExcelJS.Workbook, cliente: Cliente, reporte: ReporteVentas) {
  // Sheet 1: Resumen Anual
  const wsRes = wb.addWorksheet('Resumen anual', { properties: { tabColor: { arg: COLORS.primary } } })
  setupPrintOptions(wsRes)
  
  wsRes.columns = [
    { width: 20 }, // MES
    { width: 22 }, // PEDIDOS
    { width: 22 }, // PRODUCTOS
    { width: 22 }, // UNIDADES
    { width: 10 },
    { width: 10 }
  ]

  applyCommonHeader(wsRes, 'REPORTE DE VENTAS POR CLIENTE', cliente, reporte.year)
  applyResumenMetrics(wsRes, reporte)

  // Evolución Table
  wsRes.mergeCells('A14:D14')
  const evTitle = wsRes.getCell('A14')
  evTitle.value = 'EVOLUCIÓN MENSUAL'
  evTitle.font = { color: { arg: COLORS.textSecondary }, bold: true, size: 10 }
  evTitle.alignment = { vertical: 'bottom' }
  wsRes.getRow(14).height = 30

  const evHeaders = ['MES', 'PEDIDOS DESPACHADOS', 'PRODUCTOS', 'UNIDADES']
  const evHeaderRow = wsRes.getRow(16)
  evHeaders.forEach((h, i) => {
    const cell = evHeaderRow.getCell(i + 1)
    cell.value = h
    cell.font = { color: { arg: COLORS.white }, bold: true, size: 9 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { arg: COLORS.primary } }
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', indent: i === 0 ? 1 : 0 }
  })
  evHeaderRow.height = 24

  let startRow = 17
  if (reporte.modo === 'anual') {
    reporte.meses.forEach((m, idx) => {
      const row = wsRes.getRow(startRow + idx)
      row.values = [MESES[m.month - 1].toUpperCase(), m.pedidosDespachados, m.productosDistintos, m.unidadesTotales]
      row.height = 20
  
      row.eachCell((cell, colNum) => {
        cell.font = { color: { arg: colNum === 1 ? COLORS.text : COLORS.textSecondary }, size: 10, bold: colNum === 1 }
        cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'right', indent: colNum === 1 ? 1 : 0 }
        cell.border = { bottom: { style: 'thin', color: { arg: COLORS.border } } }
        if (colNum > 1) cell.numFmt = '#,##0'
      })
    })
  }

  // Sheet 2: Productos
  const wsProd = wb.addWorksheet('Productos')
  setupPrintOptions(wsProd)
  
  wsProd.columns = [
    { width: 38 }, // A: Producto
    { width: 22 }, // B: SKU
    { width: 11 }, // C: U/CAJA
    { width: 11 }, // D: CAJAS
    { width: 11 }, // E: SUELTOS
    { width: 14 }  // F: UNIDADES
  ]

  wsProd.mergeCells('A2:F2')
  const prodTitle = wsProd.getCell('A2')
  prodTitle.value = 'TOTAL ANUAL POR PRODUCTO'
  prodTitle.font = { color: { arg: COLORS.text }, bold: true, size: 16 }
  prodTitle.alignment = { vertical: 'middle', horizontal: 'left' }
  wsProd.getRow(2).height = 30

  wsProd.getCell('A4').value = 'CLIENTE'
  wsProd.mergeCells('B4:C4')
  wsProd.getCell('B4').value = cliente.nombre
  
  wsProd.getCell('A5').value = 'AÑO'
  wsProd.getCell('B5').value = reporte.year

  for (let r = 4; r <= 5; r++) {
    const lbl = wsProd.getCell(`A${r}`)
    lbl.font = { color: { arg: COLORS.textSecondary }, bold: true, size: 9 }
    
    const val = wsProd.getCell(`B${r}`)
    val.font = { color: { arg: COLORS.text }, size: 10, bold: r === 4 }
    
    for (let c = 1; c <= 6; c++) {
      wsProd.getCell(r, c).border = { bottom: { style: 'thin', color: { arg: COLORS.border } } }
    }
    wsProd.getRow(r).height = 22
  }

  const prodHeaders = ['PRODUCTO', 'SKU', 'U/CAJA', 'CAJAS', 'SUELTOS', 'UNIDADES']
  const pHeaderRow = wsProd.getRow(7)
  prodHeaders.forEach((h, i) => {
    const cell = pHeaderRow.getCell(i + 1)
    cell.value = h
    cell.font = { color: { arg: COLORS.white }, bold: true, size: 9 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { arg: COLORS.primary } }
    cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'right', indent: i < 2 ? 1 : 0 }
  })
  pHeaderRow.height = 24

  let pStartRow = 8
  reporte.productos.forEach((p, idx) => {
    const row = wsProd.getRow(pStartRow + idx)
    row.values = [p.nombre, p.sku, p.unidadesPorCaja, p.cajas, p.sueltos, p.unidades]
    row.height = 20

    row.eachCell((cell, colNum) => {
      cell.font = { color: { arg: colNum === 1 ? COLORS.text : COLORS.textSecondary }, size: 10, bold: colNum === 1 }
      cell.alignment = { vertical: 'middle', horizontal: colNum < 3 ? 'left' : 'right', indent: colNum < 3 ? 1 : 0 }
      cell.border = { bottom: { style: 'thin', color: { arg: COLORS.border } } }
      if (colNum > 2) cell.numFmt = '#,##0'
    })
  })

  wsProd.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 6 } }
  wsProd.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]
  wsProd.pageSetup.printTitlesRow = '1:7'
}

export async function generarExcelVentas(cliente: Cliente, reporte: ReporteVentas): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ale-Bet Logística'
  wb.created = new Date()
  wb.calcProperties.fullCalcOnLoad = true

  if (reporte.modo === 'mensual') {
    buildMensualSheet(wb, cliente, reporte)
  } else {
    buildAnualSheets(wb, cliente, reporte)
  }

  const suffix = reporte.modo === 'mensual' ? `-${String(reporte.month).padStart(2, '0')}` : ''
  const filename = `ventas-${miniSlugify(cliente.nombre)}-${reporte.year}${suffix}.xlsx`

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  
  URL.revokeObjectURL(url)
}
