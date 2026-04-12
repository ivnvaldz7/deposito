import 'dotenv/config'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { AppId, platformDb } from '@platform/db'
import { createUser, getUserByEmail } from '@platform/core'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(
  cors({
    origin: ['http://localhost:5174'],
    credentials: false,
  })
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/seed', async (_req, res) => {
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      res.status(500).json({
        error: 'ADMIN_EMAIL y ADMIN_PASSWORD deben estar definidos',
      })
      return
    }

    const existingUser = await getUserByEmail(platformDb, adminEmail)

    if (existingUser) {
      await platformDb.platformUser.update({
        where: { id: existingUser.id },
        data: { isPlatformAdmin: true },
      })

      res.json({
        created: false,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          nombre: existingUser.nombre,
        },
      })
      return
    }

    const user = await createUser(platformDb, {
      email: adminEmail,
      nombre: 'Administrador',
      password: adminPassword,
      appAccess: [
        { app: AppId.deposito, rol: 'encargado' },
        { app: AppId.ale_bet, rol: 'supervisor' },
      ],
    })

    await platformDb.platformUser.update({
      where: { id: user.id },
      data: { isPlatformAdmin: true },
    })

    res.status(201).json({
      created: true,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
      },
    })
  })
}

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const message =
      error instanceof Error ? error.message : 'Error interno del servidor'

    res.status(500).json({ error: message })
  }
)

app.listen(port, () => {
  console.log(`Admin server escuchando en http://localhost:${port}`)
})
