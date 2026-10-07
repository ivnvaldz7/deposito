require('dotenv').config()
const { default: router } = require('./apps/platform/server/src/routes/ale-bet/productos')
console.log(router.stack.map(l => `${Object.keys(l.route?.methods || {})[0]?.toUpperCase()} ${l.route?.path}`))
