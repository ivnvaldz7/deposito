import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/prisma', () => ({ prisma: {} }))

import drogasRouter from '../routes/drogas'

describe('Drogas legacy writes', () => {
  function createApp() {
    const app = express()
    app.use(express.json())
    app.use('/api/drogas', drogasRouter)
    return app
  }

  it('does not expose the retired POST, PUT, or DELETE endpoints', async () => {
    const app = createApp()

    await request(app).post('/api/drogas').send({}).expect(404)
    await request(app).put('/api/drogas/droga-1').send({}).expect(404)
    await request(app).delete('/api/drogas/droga-1').expect(404)
  })
})
