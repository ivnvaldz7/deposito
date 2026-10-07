require('dotenv').config()
const { platformDb } = require('@platform/db')
const { generateAccessToken } = require('@platform/core')

async function run() {
  const p = await platformDb.producto.findFirst()
  console.log('PRODUCT_ID:', p.id)
  
  const token = generateAccessToken({ 
    sub: 'test-user', 
    email: 'test@example.com', 
    apps: [{ id: 'ale-bet', rol: 'admin', activo: true }] 
  })
  console.log('TOKEN:', token)
}
run()
