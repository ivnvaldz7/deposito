import { platformDb as prisma } from '@platform/db'
import jwt from 'jsonwebtoken'

async function run() {

  // get a client
  const cliente = await prisma.cliente.findFirst({ where: { estado: 'VALIDADO' } })
  // get a product
  const producto = await prisma.producto.findFirst()

  if (!cliente || !producto) {
    console.log('Falta cliente o producto')
    return
  }

  const token = jwt.sign(
    { sub: 'admin-1', email: 'admin@example.com', apps: { 'ale-bet': { rol: 'admin', activo: true } } },
    'dev-secret-no-usar-en-produccion-minimo-32-chars',
    { expiresIn: '1h' }
  )

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }

  // 1. Create order
  const createRes = await fetch('http://localhost:3000/api/ale-bet/pedidos', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': 'idemp-' + Date.now() },
    body: JSON.stringify({
      clienteId: cliente.id,
      items: [
        { productoId: producto.id, cantidad: 10 }
      ]
    })
  })

  const creado = await createRes.json()
  console.log('Creado status:', createRes.status)
  if (createRes.status !== 201) {
    console.log(creado)
    return
  }
  console.log('Creado version:', creado.version)

  const key = 'idemp-approve-same-' + Date.now()
  // 2. Approve order (Concurrently!)
  const p1 = fetch(`http://localhost:3000/api/ale-bet/pedidos/${creado.id}/aprobar`, {
    method: 'PUT',
    headers: { ...headers, 'Idempotency-Key': key },
    body: JSON.stringify({
      expectedVersion: creado.version
    })
  })

  const p2 = fetch(`http://localhost:3000/api/ale-bet/pedidos/${creado.id}/aprobar`, {
    method: 'PUT',
    headers: { ...headers, 'Idempotency-Key': key },
    body: JSON.stringify({
      expectedVersion: creado.version
    })
  })

  const [res1, res2] = await Promise.all([p1, p2])
  console.log('Aprobar 1 status:', res1.status)
  console.log(await res1.json())
  
  console.log('Aprobar 2 status:', res2.status)
  console.log(await res2.json())
}

run().catch(console.error)
