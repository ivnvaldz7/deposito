import { describe, expect, it } from 'vitest'
import { buildCuarentenaPrintArgs } from '../cuarentena-label-printer'

describe('buildCuarentenaPrintArgs', () => {
  it('passes values as discrete PowerShell arguments, never through a shell command', () => {
    const args = buildCuarentenaPrintArgs({ producto: 'OLIVITASAN PLUS 500ML', lote: '3506', fechaIngreso: '02/10/2026', copias: 3 }, {
      templatePath: 'C:\\AleBet\\labels\\CUARENTENA.lbx',
      printerName: 'Brother QL-800',
      scriptPath: 'C:\\repo\\scripts\\windows\\print-cuarentena-label.ps1',
    })

    expect(args).toEqual(expect.arrayContaining([
      '-File', 'C:\\repo\\scripts\\windows\\print-cuarentena-label.ps1',
      '-Producto', 'ETIQUETA OLIVITASAN PLUS 500ML',
      '-Lote', '3506',
      '-Fecha', '02/10/2026',
      '-Copies', '3',
    ]))
  })
})
