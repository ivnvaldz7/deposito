import { config } from 'dotenv'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: join(__dirname, '../../.env') })

async function main() {
  const { platformDb } = await import('@platform/db')

  const beforeCount = await platformDb.inventarioEstuche.count({
    where: { cantidad: { gt: 0 } }
  })
  
  console.log(`Registros afectados (antes): ${beforeCount} tienen cantidad > 0`)

  const res = await platformDb.inventarioEstuche.updateMany({
    data: { cantidad: 0 }
  })

  console.log(`Registros actualizados a 0: ${res.count}`)

  const afterCount = await platformDb.inventarioEstuche.count({
    where: { cantidad: { gt: 0 } }
  })

  console.log(`Registros afectados (despues): ${afterCount} tienen cantidad > 0`)

  await platformDb.$disconnect()
}

main().catch(console.error)
