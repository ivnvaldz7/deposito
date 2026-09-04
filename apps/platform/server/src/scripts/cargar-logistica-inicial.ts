import 'dotenv/config'
import { platformDb as prisma } from '@platform/db'
import { applyInitialLogisticsLoad, preflightInitialLogisticsLoad } from '../routes/ale-bet/logistica-initial-load-service'

async function main() {
  const preflight = await preflightInitialLogisticsLoad()
  console.log(JSON.stringify({ stage: 'preflight', ...preflight }, null, 2))
  if (preflight.conflicts.length > 0) throw new Error('Preflight conflicts prevent initial logistics load')
  const result = await applyInitialLogisticsLoad()
  console.log(JSON.stringify({ stage: 'applied', ...result }, null, 2))
}

main().finally(() => prisma.$disconnect())
