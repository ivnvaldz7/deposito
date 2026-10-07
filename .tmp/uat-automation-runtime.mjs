import 'dotenv/config'
import { createRequire } from 'node:module'
import { Client } from 'pg'

const url = new URL(process.env.PLATFORM_DATABASE_URL ?? '')
url.pathname = '/platform_test'
process.env.PLATFORM_DATABASE_URL = url.toString()

const require = createRequire(import.meta.url)
const express = require('express')
const request = require('supertest')
const jwt = require('jsonwebtoken')
const { createAleBetRoutes } = require('../apps/platform/server/dist/routes/ale-bet/index.js')

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { sub: 'uat-automation-runtime-audit', email: 'uat-automation-runtime-audit@test.local', apps: { 'ale-bet': { rol: 'admin', activo: true } } }
  next()
})
app.use('/api/ale-bet', createAleBetRoutes())

const client = new Client({ connectionString: url.toString() })
const ids = []
const authorization = `Bearer ${jwt.sign({ sub: 'uat-automation-runtime-audit', email: 'uat-automation-runtime-audit@test.local', apps: { 'ale-bet': { rol: 'admin', activo: true } } }, process.env.PLATFORM_JWT_SECRET)}`

async function post(originalText) {
  const response = await request(app)
    .post('/api/ale-bet/automation/drafts')
    .send({ originalText })
    .expect(201)
  ids.push(response.body.id)
  return response.body
}

async function main() {
  await client.connect()
  const batch = await post('FEDERAL 3\n400 plus 500ml\n504 b12b15 100ml\n240 b12b15 250ml\n12 cetri 1lt')
  const isolated = await post('24 b12b15 250')
  const cetriDraft = await post('12 cetri 1lt')
  const draftAvailability = await request(app).get(`/api/ale-bet/automation/drafts/${cetriDraft.id}`).expect(200)
  const productos = await request(app).get('/api/ale-bet/productos').set('Authorization', authorization).expect(200)
  const stock = await request(app).get('/api/ale-bet/stock').set('Authorization', authorization).expect(200)
  const cetriProducto = productos.body.find((product) => product.nombre === 'CETRI-AMON 1 L')
  const cetriStock = stock.body.productos.find((product) => product.nombre === 'CETRI-AMON 1 L')
  console.log(JSON.stringify({ batch, isolated, cetriAvailability: draftAvailability.body.availability, cetriProducto, cetriStock }, null, 2))
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(async () => {
    if (ids.length > 0) await client.query('DELETE FROM "ale_bet"."OrderInterpretationDraft" WHERE id = ANY($1)', [ids])
    await client.end()
  })
