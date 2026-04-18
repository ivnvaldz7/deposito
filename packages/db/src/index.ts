import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client/index.js'
export { PrismaClient, AppId } from './generated/client/index.js'

const globalForPrisma = globalThis as unknown as {
  platformDb: PrismaClient | undefined
}

function createPlatformDb(): PrismaClient {
  const datasourceUrl = process.env.PLATFORM_DATABASE_URL

  if (!datasourceUrl) {
    throw new Error('PLATFORM_DATABASE_URL no está definido')
  }

  const adapter = new PrismaPg({ connectionString: datasourceUrl })

  return new PrismaClient({
    adapter,
  })
}

export const platformDb = globalForPrisma.platformDb ?? createPlatformDb()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.platformDb = platformDb
}

export type { PlatformUser, AppAccess, AppId as AppIdType } from './generated/client/index.js'
