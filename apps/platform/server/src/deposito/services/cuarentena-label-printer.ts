import { existsSync } from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const DEFAULT_TEMPLATE_PATH = 'C:\\AleBet\\labels\\CUARENTENA.lbx'
const DEFAULT_PRINTER_NAME = 'Brother QL-800'
const MAX_COPIES = 100
const PROCESS_TIMEOUT_MS = 30_000
const MAX_OUTPUT_BYTES = 16 * 1024

export class CuarentenaLabelPrinterError extends Error {
  constructor(message: string, readonly statusCode = 503) {
    super(message)
    this.name = 'CuarentenaLabelPrinterError'
  }
}

export interface CuarentenaLabelInput {
  producto: string
  lote: string
  fechaIngreso: string
  copias: number
}

interface PrintRuntimeConfig {
  templatePath: string
  printerName: string
  scriptPath: string
}

export function getCuarentenaLabelRuntimeConfig(env: NodeJS.ProcessEnv = process.env): PrintRuntimeConfig {
  return {
    templatePath: env.BROTHER_CUARENTENA_TEMPLATE_PATH?.trim() || DEFAULT_TEMPLATE_PATH,
    printerName: env.BROTHER_CUARENTENA_PRINTER?.trim() || DEFAULT_PRINTER_NAME,
    scriptPath: path.resolve(process.cwd(), 'scripts', 'windows', 'print-cuarentena-label.ps1'),
  }
}

function validateInput(input: CuarentenaLabelInput): void {
  if (!Number.isInteger(input.copias) || input.copias < 1 || input.copias > MAX_COPIES) {
    throw new CuarentenaLabelPrinterError(`La cantidad de copias debe ser un número entero entre 1 y ${MAX_COPIES}.`, 400)
  }

  for (const [field, value] of Object.entries({ producto: input.producto, lote: input.lote, fechaIngreso: input.fechaIngreso })) {
    if (!value.trim() || /[\r\n\0]/.test(value)) {
      throw new CuarentenaLabelPrinterError(`El campo ${field} de la etiqueta no es válido.`, 400)
    }
  }
}

export function buildCuarentenaPrintArgs(input: CuarentenaLabelInput, config: PrintRuntimeConfig): string[] {
  return [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', config.scriptPath,
    '-TemplatePath', config.templatePath,
    '-PrinterName', config.printerName,
    '-Producto', `ETIQUETA ${input.producto}`,
    '-Lote', input.lote,
    '-Fecha', input.fechaIngreso,
    '-Copies', String(input.copias),
  ]
}

function safeProcessMessage(stderr: string, exitCode: number | null): string {
  const oneLine = stderr.replace(/[\r\n]+/g, ' ').trim()
  if (/no contiene el campo requerido|no se encontró|no está disponible|desconectada|no se pudo abrir la plantilla|no se pudo seleccionar la impresora/i.test(oneLine)) {
    return oneLine.slice(0, 500)
  }
  return `No se pudo enviar la etiqueta a la impresora${exitCode === null ? '' : ` (código ${exitCode})`}.`
}

export async function printCuarentenaLabel(input: CuarentenaLabelInput, config = getCuarentenaLabelRuntimeConfig()): Promise<void> {
  validateInput(input)
  if (process.platform !== 'win32') throw new CuarentenaLabelPrinterError('La impresión de etiquetas solo está disponible en el servidor Windows del depósito.')
  if (!existsSync(config.templatePath)) throw new CuarentenaLabelPrinterError('No se encontró la plantilla de cuarentena configurada.')
  if (!existsSync(config.scriptPath)) throw new CuarentenaLabelPrinterError('No se encontró el componente local de impresión.')

  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const args = buildCuarentenaPrintArgs(input, config)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(powershell, args, { windowsHide: true, shell: false })
    let stderr = ''
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      error ? reject(error) : resolve()
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish(new CuarentenaLabelPrinterError('La impresora no respondió dentro de 30 segundos. Verificá que la QL-800 esté encendida.'))
    }, PROCESS_TIMEOUT_MS)

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - stderr.length)
    })
    child.on('error', () => finish(new CuarentenaLabelPrinterError('No se pudo iniciar el componente local de impresión.')))
    child.on('close', (code) => {
      if (code === 0) finish()
      else finish(new CuarentenaLabelPrinterError(safeProcessMessage(stderr, code)))
    })
  })
}
