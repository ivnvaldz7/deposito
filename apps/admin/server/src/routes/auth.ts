import { Router } from 'express'
import {
  comparePassword,
  getUserByEmail,
  signToken,
  type JwtPayload,
} from '@platform/core'
import { platformDb } from '@platform/db'

const router = Router()

interface LoginBody {
  email?: string
  password?: string
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body as LoginBody

  if (!email || !password) {
    res.status(400).json({ error: 'Email y password son obligatorios' })
    return
  }

  const user = await getUserByEmail(platformDb, email)

  if (!user || !user.activo) {
    res.status(401).json({ error: 'Credenciales inválidas' })
    return
  }

  const isValidPassword = await comparePassword(password, user.password)

  if (!isValidPassword) {
    res.status(401).json({ error: 'Credenciales inválidas' })
    return
  }

  const apps = user.appAccess.reduce<JwtPayload['apps']>((acc, access) => {
    acc[access.app] = {
      rol: access.rol,
      activo: access.activo,
    }

    return acc
  }, {})

  const token = signToken({
    sub: user.id,
    email: user.email,
    apps,
  })

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
    },
  })
})

export default router
