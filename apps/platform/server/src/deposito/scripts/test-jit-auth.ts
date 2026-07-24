import 'dotenv/config'
import { platformDb } from '@platform/db'
import { prisma } from '../lib/prisma'
import { signToken, getUserByEmail } from '@platform/core'
import { authenticate } from '../middleware/auth'
import { Request, Response, NextFunction } from 'express'

async function runTest() {
  console.log('Testing JIT Auth Provisioning...')
  
  // 1. Get a mock user from platform DB
  const platformUser = await getUserByEmail(platformDb as any, 'admin@example.com')
  
  if (!platformUser) {
    console.error('No admin@example.com found in platform DB')
    process.exit(1)
  }

  // 2. Ensure they DO NOT exist in deposito DB yet
  await prisma.user.deleteMany({
    where: { email: platformUser.email }
  })

  // 3. Generate a token as if they logged in
  const apps = platformUser.appAccess.reduce<Record<string, { rol: string; activo: boolean }>>(
    (acc, access) => {
      acc[access.app] = {
        rol: access.rol,
        activo: access.activo,
      }
      return acc
    },
    {}
  )
  
  const token = signToken({
    sub: platformUser.id,
    email: platformUser.email,
    apps,
  })

  // 4. Mock Express Request/Response
  const req = {
    headers: {
      authorization: `Bearer ${token}`
    }
  } as Request

  let statusCode = 200
  let resJson = null
  
  const res = {
    status: (code: number) => {
      statusCode = code
      return res
    },
    json: (data: any) => {
      resJson = data
    }
  } as Response

  let nextCalled = false
  const next: NextFunction = () => {
    nextCalled = true
  }

  // 5. Call authenticate middleware
  await authenticate(req, res, next)

  // 6. Verify assertions
  if (!nextCalled) {
    console.error('FAILED: next() was not called. Response:', statusCode, resJson)
    process.exit(1)
  }

  console.log('Middleware passed. Checking if user was created in DB...')
  
  const depositoUser = await prisma.user.findFirst({
    where: { email: platformUser.email }
  })

  if (!depositoUser) {
    console.error('FAILED: User was not created in deposito schema!')
    process.exit(1)
  }

  console.log('SUCCESS: User was successfully provisioned JIT!')
  console.log('Provisioned User:', depositoUser)
  
  // Clean up
  await platformDb.$disconnect()
  await prisma.$disconnect()
}

runTest().catch(e => {
  console.error(e)
  process.exit(1)
})
