import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import PDFDocument from 'pdfkit'
import { renderRemitoPdf } from '../routes/ale-bet/remito-pdf'

const outputPath = resolve(process.cwd(), '../../../output/pdf/alebet-remito-demo.pdf')
mkdirSync(dirname(outputPath), { recursive: true })

const document = new PDFDocument({ size: 'A4', margin: 0 })
const stream = createWriteStream(outputPath)
document.pipe(stream)
renderRemitoPdf(document, {
  numero: 'R-DEMO-20260805-001',
  fecha: new Date('2026-08-05T12:00:00.000Z'),
  clienteSnapshot: {
    nombre: 'Veterinaria Demo S.A.',
    direccion: 'Av. Demo 123',
    localidad: 'La Plata',
    provincia: 'Buenos Aires',
    cuit: '30-99999999-1',
    condicionIva: 'Responsable Inscripto',
    condicionVenta: 'Cuenta corriente 30 días',
  },
  transporteSnapshot: {
    nombre: 'Transporte Demo',
    direccion: 'Ruta Demo Km 10',
  },
  transporteNombre: 'Transporte Demo',
  transporteDireccion: 'Ruta Demo Km 10',
  itemsSnapshot: [
    { productoId: 'demo-product-1', nombre: 'DEMO Olivitasan D', cantidad: 17 },
    { productoId: 'demo-product-2', nombre: 'DEMO Cefalexina 250', cantidad: 3 },
    { productoId: 'demo-product-3', nombre: 'DEMO Antiparasitario', cantidad: 7 },
  ],
})
document.end()

stream.on('finish', () => {
  process.stdout.write(`Generated ${outputPath}\n`)
})
