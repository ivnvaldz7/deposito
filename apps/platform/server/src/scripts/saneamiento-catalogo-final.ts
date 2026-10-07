import 'dotenv/config'
import { platformDb } from '@platform/db'
import { CatalogoSaneamientoService } from '../deposito/services/catalogo-saneamiento-service'

async function main() {
  const service = new CatalogoSaneamientoService(platformDb)
  const result = await service.run()
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(async () => platformDb.$disconnect())
