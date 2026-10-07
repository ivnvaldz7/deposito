require('dotenv').config()
const { platformDb } = require('@platform/db')

async function run() {
  const ubicaciones = await platformDb.ubicacionStock.findMany({ select: { id: true, codigo: true }})
  console.log('Ubicaciones:', ubicaciones)
  
  // Find a product with a lot and 0 stock
  const lotes = await platformDb.lote.findMany({
    include: {
      saldos: true,
      producto: true
    },
    take: 10
  })
  
  const loteValido = lotes.find(l => l.saldos.every(s => s.cantidad === 0))
  if (loteValido) {
    console.log('Lote Valido:', loteValido.id)
    console.log('Producto:', loteValido.productoId)
  }
}
run()
