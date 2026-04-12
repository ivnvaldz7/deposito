import type {
  AppAccess,
  AppIdType as AppId,
  PlatformUser,
  PrismaClient,
} from '@platform/db'
import { hashPassword } from '../auth/password'

type PlatformUserWithAccess = PlatformUser & {
  appAccess: AppAccess[]
}

type PlatformDb = Pick<PrismaClient, 'platformUser' | 'appAccess'>

interface CreateUserInput {
  email: string
  nombre: string
  password: string
  appAccess: Array<{
    app: AppId
    rol: string
  }>
}

interface UpdateAppAccessInput {
  rol?: string
  activo?: boolean
}

export async function createUser(
  db: PlatformDb,
  input: CreateUserInput
): Promise<PlatformUserWithAccess> {
  const password = await hashPassword(input.password)

  return db.platformUser.create({
    data: {
      email: input.email,
      nombre: input.nombre,
      password,
      appAccess: {
        create: input.appAccess.map((access) => ({
          app: access.app,
          rol: access.rol,
          activo: true,
        })),
      },
    },
    include: {
      appAccess: true,
    },
  })
}

export async function getUserById(
  db: PlatformDb,
  id: string
): Promise<PlatformUserWithAccess | null> {
  return db.platformUser.findUnique({
    where: { id },
    include: {
      appAccess: true,
    },
  })
}

export async function getUserByEmail(
  db: PlatformDb,
  email: string
): Promise<PlatformUserWithAccess | null> {
  return db.platformUser.findUnique({
    where: { email },
    include: {
      appAccess: true,
    },
  })
}

export async function listUsers(db: PlatformDb): Promise<PlatformUserWithAccess[]> {
  return db.platformUser.findMany({
    include: {
      appAccess: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}

export async function updateAppAccess(
  db: PlatformDb,
  userId: string,
  app: AppId,
  data: UpdateAppAccessInput
): Promise<AppAccess> {
  return db.appAccess.upsert({
    where: {
      userId_app: {
        userId,
        app,
      },
    },
    update: {
      ...(data.rol !== undefined ? { rol: data.rol } : {}),
      ...(data.activo !== undefined ? { activo: data.activo } : {}),
    },
    create: {
      userId,
      app,
      rol: data.rol ?? 'operario',
      activo: data.activo ?? true,
    },
  })
}

export async function deactivateUser(
  db: PlatformDb,
  userId: string
): Promise<PlatformUser> {
  return db.platformUser.update({
    where: { id: userId },
    data: { activo: false },
  })
}
