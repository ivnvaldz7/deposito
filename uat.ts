import { hasPermission, roleHasPermission, type JwtPayload } from './packages/platform-core/src'

console.log('--- RUNNING UAT 1B.1 ---')

function createPayload(app: 'ale-bet' | 'deposito', rol: string | null, isPlatformAdmin: boolean = false): JwtPayload {
  return {
    sub: 'user-1',
    email: 'test@test.com',
    name: 'Test',
    isPlatformAdmin,
    apps: {
      [app]: {
        active: true, // legacy
        activo: true, // updated
        rol: rol || undefined
      }
    }
  } as unknown as JwtPayload
}

let fails = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`)
  } else {
    console.error(`❌ FAIL: ${message}`)
    fails++
  }
}

// 1. LOGÍSTICA — PRODUCTOS / STOCK
// VENDEDOR
const vendedor = createPayload('ale-bet', 'vendedor')
assert(hasPermission(vendedor, 'ale-bet', 'productos.read'), 'Vendedor ve Productos')
assert(hasPermission(vendedor, 'ale-bet', 'stock.read'), 'Vendedor ve Stock')
assert(!hasPermission(vendedor, 'ale-bet', 'stock.lots.create'), 'Vendedor NO crea lote')
assert(!hasPermission(vendedor, 'ale-bet', 'stock.lots.adjust'), 'Vendedor NO ajusta')
assert(!hasPermission(vendedor, 'ale-bet', 'stock.transfer'), 'Vendedor NO transfiere')

// ARMADOR
const armador = createPayload('ale-bet', 'armador')
assert(hasPermission(armador, 'ale-bet', 'productos.read'), 'Armador ve Productos')
assert(hasPermission(armador, 'ale-bet', 'stock.read'), 'Armador ve Stock')
assert(!hasPermission(armador, 'ale-bet', 'stock.lots.create'), 'Armador NO crea lote')

// FACTURACIÓN
const facturacion = createPayload('ale-bet', 'facturacion')
assert(hasPermission(facturacion, 'ale-bet', 'productos.read'), 'Facturación ve Productos')
assert(!hasPermission(facturacion, 'ale-bet', 'stock.lots.adjust'), 'Facturación NO ajusta')

// ENCARGADO
const encargado = createPayload('ale-bet', 'encargado')
assert(hasPermission(encargado, 'ale-bet', 'productos.read'), 'Encargado ve Productos')
assert(hasPermission(encargado, 'ale-bet', 'stock.lots.create'), 'Encargado crea lote')
assert(hasPermission(encargado, 'ale-bet', 'stock.lots.adjust'), 'Encargado ajusta')
assert(hasPermission(encargado, 'ale-bet', 'stock.transfer'), 'Encargado transfiere')
assert(hasPermission(encargado, 'ale-bet', 'stock.history.read'), 'Encargado ve historial')

// OBSERVADOR
const observador = createPayload('ale-bet', 'observador')
assert(hasPermission(observador, 'ale-bet', 'productos.read'), 'Observador ve Productos')
assert(!hasPermission(observador, 'ale-bet', 'productos.manage'), 'Observador NO maneja productos')
assert(!hasPermission(observador, 'ale-bet', 'stock.lots.create'), 'Observador NO gestiona stock')

// ADMIN ALE-BET
const admin = createPayload('ale-bet', 'admin')
assert(hasPermission(admin, 'ale-bet', 'stock.lots.create'), 'Admin Ale-Bet puede gestionar stock')
assert(!admin.isPlatformAdmin, 'Admin Ale-Bet no es Platform Admin')

// 2. PEDIDOS — HOMOLOGACIÓN ENCARGADO
assert(roleHasPermission('ale-bet', 'encargado', 'pedidos.take'), 'Encargado tomar pedido')
assert(roleHasPermission('ale-bet', 'encargado', 'pedidos.prepare'), 'Encargado preparar')
assert(roleHasPermission('ale-bet', 'encargado', 'pedidos.complete_items'), 'Encargado completar')
assert(roleHasPermission('ale-bet', 'encargado', 'pedidos.dispatch'), 'Encargado despachar')

// 3. CLIENTES — MATRIZ
assert(!hasPermission(encargado, 'ale-bet', 'clientes.create'), 'Encargado clientes.create = DENY')
assert(hasPermission(armador, 'ale-bet', 'clientes.read'), 'Armador clientes.read = ALLOW')

// 4. DEPÓSITO — CATÁLOGO
const encDep = createPayload('deposito', 'encargado')
assert(hasPermission(encDep, 'deposito', 'productos_catalogo.read'), 'Encargado Deposito lee catalogo')
assert(hasPermission(encDep, 'deposito', 'productos_catalogo.manage'), 'Encargado Deposito gestiona catalogo')

const obsDep = createPayload('deposito', 'observador')
assert(hasPermission(obsDep, 'deposito', 'productos_catalogo.read'), 'Observador Deposito lee catalogo')
assert(!hasPermission(obsDep, 'deposito', 'productos_catalogo.manage'), 'Observador Deposito NO gestiona catalogo')

const solDep = createPayload('deposito', 'solicitante')
assert(hasPermission(solDep, 'deposito', 'productos_catalogo.read'), 'Solicitante lee catalogo')
assert(!hasPermission(solDep, 'deposito', 'productos_catalogo.manage'), 'Solicitante NO gestiona catalogo')

// User legacy/JIT que no tiene rol en deposito
const noRoleDep = createPayload('deposito', null)
assert(!hasPermission(noRoleDep, 'deposito', 'productos_catalogo.read'), 'JIT User no lee deposito catalogo sin rol')

// 5. DENY BY DEFAULT
const unknownRole = createPayload('ale-bet', 'cajera')
assert(!hasPermission(unknownRole, 'ale-bet', 'productos.read'), 'Rol inexistente -> false')

const inactiveApp = { ...vendedor, apps: { 'ale-bet': { activo: false, rol: 'vendedor' } } } as unknown as JwtPayload
assert(!hasPermission(inactiveApp, 'ale-bet', 'productos.read'), 'AppAccess inactivo -> false')

const noAppAccess = { ...vendedor, apps: {} } as unknown as JwtPayload
assert(!hasPermission(noAppAccess, 'ale-bet', 'productos.read'), 'Usuario sin acceso a app -> false')

// Fake permission via any cast
assert(!hasPermission(encargado, 'ale-bet', 'invented.perm' as any), 'Permiso inexistente -> false')

// 6. PLATFORM ADMIN
const pAdmin = createPayload('ale-bet', null, true)
assert(hasPermission(pAdmin, 'admin', 'platform_admin'), 'Platform Admin tiene platform_admin')
assert(!hasPermission(admin, 'admin', 'platform_admin'), 'Admin Ale-Bet NO obtiene acceso a /api/admin')

if (fails > 0) {
  console.log(`\n❌ UAT FAILS: ${fails}`)
  process.exit(1)
} else {
  console.log('\n✅ ALL UAT TESTS PASSED')
}
