import { Router } from 'express'
import { comparePassword, getUserByEmail, signToken } from '@platform/core'
import { platformDb } from '@platform/db'

const router = Router()

router.post('/login', async (req, res) => {
  const body = req.body as {
    email?: string
    password?: string
  }

  if (!body.email || !body.password) {
    res.status(400).json({ error: 'Email y password son obligatorios' })
    return
  }

  const user = await getUserByEmail(platformDb, body.email)

  if (!user || !user.activo) {
    res.status(401).json({ error: 'Credenciales inválidas' })
    return
  }

  const isValidPassword = await comparePassword(body.password, user.password)

  if (!isValidPassword) {
    res.status(401).json({ error: 'Credenciales inválidas' })
    return
  }

  const apps = user.appAccess.reduce<Record<string, { rol: string; activo: boolean }>>(
    (acc, access) => {
      acc[access.app] = {
        rol: access.rol,
        activo: access.activo,
      }

      return acc
    },
    {}
  )

  const aleBetAccess = apps.ale_bet

  if (!aleBetAccess || aleBetAccess.activo !== true) {
    res.status(403).json({ error: 'No tiene acceso a Ale-Bet' })
    return
  }

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
      rol: aleBetAccess.rol,
    },
  })
})

router.post('/logout', async (_req, res) => {
  res.status(204).send()
})

export default router
