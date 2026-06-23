import dotenv from 'dotenv'

dotenv.config()

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET no configurado. Agregalo a server/.env')
  process.exit(1)
}

if (!process.env.REFRESH_TOKEN_SECRET) {
  console.warn('⚠️ REFRESH_TOKEN_SECRET no configurado. Se usará JWT_SECRET como fallback.')
}
