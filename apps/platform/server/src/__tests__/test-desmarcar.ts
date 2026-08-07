import { app } from '../server'
import request from 'supertest'
import { prisma } from '@platform/db'
import { signToken } from '../utils/jwt'

async function main() {
  const server = await app()

  const user = await prisma.usuario.findFirst({ where: { rol: 'armador' } })
  const token = signToken({ sub: user.id, username: user.username, rol: user.rol, tenantId: 'tenant-1' })

  let pedido = await prisma.pedido.findFirst({
    where: { estado: 'EN_ARMADO' },
    include: { items: true }
  })
  
  if (!pedido) {
    console.log("No pedido in EN_ARMADO found.")
    return
  }
  const item = pedido.items[0]

  console.log('--- MARCAR PREPARADO ---')
  console.log(`Version: ${pedido.version}`)
  const res1 = await request(server).put(`/api/ale-bet/pedidos/${pedido.id}/items/${item.id}/completar`)
    .set('Authorization', `Bearer ${token}`)
    .send({ expectedVersion: pedido.version })
  console.log('Status 1:', res1.status)
  if (res1.status >= 400) console.log(res1.body)

  pedido = await prisma.pedido.findUnique({ where: { id: pedido.id } })
  console.log('--- DESMARCAR ---')
  console.log(`Version: ${pedido.version}`)
  const res2 = await request(server).put(`/api/ale-bet/pedidos/${pedido.id}/items/${item.id}/completar`)
    .set('Authorization', `Bearer ${token}`)
    .send({ expectedVersion: pedido.version })
  console.log('Status 2:', res2.status)
  if (res2.status >= 400) console.log(res2.body)
}

main().catch(console.error).finally(() => process.exit(0))
