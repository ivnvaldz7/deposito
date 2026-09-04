require('dotenv').config()
const { signAccessToken } = require('@platform/core')

async function run() {
  const token = signAccessToken({ 
    sub: 'test-user', 
    email: 'test@example.com', 
    apps: { 'ale-bet': { rol: 'admin', activo: true } }
  })
  console.log('TOKEN:', token)
}
run()
