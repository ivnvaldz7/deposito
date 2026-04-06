import dotenv from 'dotenv'

dotenv.config()

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET no configurado. Agregalo a server/.env')
  process.exit(1)
}
