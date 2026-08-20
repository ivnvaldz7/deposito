export type AppPermissionKey = 'ale-bet' | 'deposito' | 'admin' | 'portal'

export type AleBetPermission =
  | 'dashboard.read'
  | 'productos.read' | 'productos.manage'
  | 'stock.read' | 'stock.read.archived' | 'stock.transfer'
  | 'stock.lots.read' | 'stock.lots.create' | 'stock.lots.adjust'
  | 'stock.history.read'
  | 'clientes.read' | 'clientes.create' | 'clientes.update' | 'clientes.import'
  | 'transportistas.read' | 'transportistas.manage'
  | 'pedidos.read' | 'pedidos.create' | 'pedidos.edit' | 'pedidos.approve'
  | 'pedidos.take' | 'pedidos.prepare' | 'pedidos.complete_items'
  | 'pedidos.dispatch' | 'pedidos.cancel' | 'pedidos.confirm_cancel'
  | 'pedidos.availability.read'
  | 'remitos.create' | 'remitos.void' | 'remitos.read.pdf'
  | 'facturacion.read' | 'facturacion.export.pdf'
  | 'historial.read' | 'historial.export'
  | 'notificaciones.stream'

export type DepositoPermission =
  | 'dashboard.read'
  | 'drogas.read' | 'drogas.read.por_vencer'
  | 'estuches.read' | 'estuches.manage'
  | 'etiquetas.read' | 'etiquetas.manage'
  | 'frascos.read' | 'frascos.manage'
  | 'actas.read' | 'actas.create' | 'actas.items.add'
  | 'actas.items.quality_approve' | 'actas.items.distribute'
  | 'ingresos.create'
  | 'movimientos.read'
  | 'pendientes.read' | 'pendientes.manage'
  | 'ordenes.read' | 'ordenes.create' | 'ordenes.approve'
  | 'ordenes.execute' | 'ordenes.reject' | 'ordenes.complete'
  | 'productos_catalogo.read' | 'productos_catalogo.manage' | 'productos_catalogo.import'
  | 'metricas.read' | 'metricas.export.pdf' | 'metricas.productos.read'
  | 'lotes.read.next'
  | 'importaciones_iniciales.create'
  | 'eventos.stream'
  | 'usuarios_deposito.read' | 'usuarios_deposito.manage'

export type AdminPermission =
  | 'platform_admin'
  | 'users.read' | 'users.create'
  | 'users.access.grant' | 'users.access.revoke' | 'users.access.role_change' | 'users.access.enable_disable'
  | 'users.disable' | 'users.password.reset' | 'users.audit.read'

export type Permission = AleBetPermission | DepositoPermission | AdminPermission

export const PERMISSIONS: Record<AppPermissionKey, readonly string[]> = {
  'ale-bet': [
    'dashboard.read', 'productos.read', 'productos.manage',
    'stock.read', 'stock.read.archived', 'stock.transfer',
    'stock.lots.read', 'stock.lots.create', 'stock.lots.adjust', 'stock.history.read',
    'clientes.read', 'clientes.create', 'clientes.update', 'clientes.import',
    'transportistas.read', 'transportistas.manage',
    'pedidos.read', 'pedidos.create', 'pedidos.edit', 'pedidos.approve',
    'pedidos.take', 'pedidos.prepare', 'pedidos.complete_items',
    'pedidos.dispatch', 'pedidos.cancel', 'pedidos.confirm_cancel',
    'pedidos.availability.read',
    'remitos.create', 'remitos.void', 'remitos.read.pdf',
    'facturacion.read', 'facturacion.export.pdf',
    'historial.read', 'historial.export',
    'notificaciones.stream'
  ] as const,
  deposito: [
    'dashboard.read',
    'drogas.read', 'drogas.read.por_vencer',
    'estuches.read', 'estuches.manage',
    'etiquetas.read', 'etiquetas.manage',
    'frascos.read', 'frascos.manage',
    'actas.read', 'actas.create', 'actas.items.add',
    'actas.items.quality_approve', 'actas.items.distribute',
    'ingresos.create',
    'movimientos.read',
    'pendientes.read', 'pendientes.manage',
    'ordenes.read', 'ordenes.create', 'ordenes.approve',
    'ordenes.execute', 'ordenes.reject', 'ordenes.complete',
    'productos_catalogo.read', 'productos_catalogo.manage', 'productos_catalogo.import',
    'metricas.read', 'metricas.export.pdf', 'metricas.productos.read',
    'lotes.read.next',
    'importaciones_iniciales.create',
    'eventos.stream',
    'usuarios_deposito.read', 'usuarios_deposito.manage'
  ] as const,
  admin: [
    'platform_admin',
    'users.read', 'users.create',
    'users.access.grant', 'users.access.revoke', 'users.access.role_change', 'users.access.enable_disable',
    'users.disable', 'users.password.reset', 'users.audit.read'
  ] as const,
  portal: [],
}

export const ROLE_PERMISSIONS: {
  [K in AppPermissionKey]: Record<string, readonly Permission[]>
} = {
  'ale-bet': {
    admin: PERMISSIONS['ale-bet'] as readonly Permission[],
    encargado: [
      'dashboard.read', 'productos.read', 'stock.read', 'stock.read.archived',
      'stock.transfer', 'stock.lots.read', 'stock.lots.create', 'stock.lots.adjust', 'stock.history.read',
      'clientes.read',
      'pedidos.read', 'pedidos.take', 'pedidos.prepare', 'pedidos.complete_items',
      'pedidos.dispatch', 'pedidos.confirm_cancel',
      'remitos.read.pdf', 'historial.read', 'historial.export', 'notificaciones.stream'
    ],
    vendedor: [
      'dashboard.read', 'productos.read', 'stock.read',
      'clientes.read', 'clientes.create',
      'pedidos.read', 'pedidos.create', 'pedidos.edit', 'pedidos.approve', 'pedidos.cancel', 'pedidos.availability.read',
      'remitos.read.pdf', 'historial.read', 'historial.export', 'notificaciones.stream'
    ],
    armador: [
      'dashboard.read', 'productos.read', 'stock.read',
      'clientes.read',
      'pedidos.read', 'pedidos.take', 'pedidos.prepare', 'pedidos.complete_items',
      'pedidos.dispatch', 'pedidos.confirm_cancel',
      'remitos.read.pdf', 'historial.read', 'historial.export', 'notificaciones.stream'
    ],
    facturacion: [
      'dashboard.read', 'productos.read', 'stock.read',
      'clientes.read', 'clientes.create', 'clientes.update', 'clientes.import',
      'transportistas.read', 'transportistas.manage',
      'pedidos.read', 'remitos.create', 'remitos.void', 'remitos.read.pdf',
      'facturacion.read', 'facturacion.export.pdf', 'historial.read', 'historial.export'
    ],
    observador: [
      'dashboard.read', 'productos.read', 'stock.read',
      'clientes.read', 'pedidos.read', 'remitos.read.pdf', 'historial.read', 'historial.export'
    ],
  },
  deposito: {
    encargado: PERMISSIONS['deposito'] as readonly Permission[],
    observador: [
      'dashboard.read', 'drogas.read', 'drogas.read.por_vencer',
      'estuches.read', 'etiquetas.read', 'frascos.read',
      'actas.read', 'movimientos.read', 'pendientes.read', 'ordenes.read',
      'productos_catalogo.read', 'metricas.read', 'metricas.export.pdf', 'metricas.productos.read',
      'lotes.read.next', 'eventos.stream'
    ],
    solicitante: [
      'dashboard.read', 'drogas.read', 'drogas.read.por_vencer',
      'estuches.read', 'etiquetas.read', 'frascos.read',
      'actas.read', 'movimientos.read', 'pendientes.read',
      'ordenes.read', 'ordenes.create', 'productos_catalogo.read', 'metricas.productos.read',
      'lotes.read.next', 'eventos.stream'
    ],
  },
  admin: {
    admin: PERMISSIONS['admin'] as readonly Permission[],
  },
  portal: {
    viewer: [],
  },
}

export function isValidPermission(app: string, permission: string): boolean {
  if (!PERMISSIONS[app as AppPermissionKey]) return false
  return PERMISSIONS[app as AppPermissionKey].includes(permission)
}

export function roleHasPermission(app: string, role: string, permission: Permission): boolean {
  if (!isValidPermission(app, permission)) return false
  const roles = ROLE_PERMISSIONS[app as AppPermissionKey]
  if (!roles) return false
  const permissions = roles[role]
  if (!permissions) return false
  return permissions.includes(permission)
}

export function getRolePermissions(app: string, role: string): Permission[] {
  const roles = ROLE_PERMISSIONS[app as AppPermissionKey]
  if (!roles) return []
  return (roles[role] || []) as Permission[]
}

import { type JwtPayload } from './jwt'

export function hasPermission(
  user: JwtPayload | null | undefined,
  app: AppPermissionKey,
  permission: Permission,
): boolean {
  if (!user) return false
  if (user.isPlatformAdmin) return true
  
  const access = user.apps?.[app]
  if (!access || !access.activo || !access.rol) return false
  
  return roleHasPermission(app, access.rol, permission)
}

export function hasAnyPermission(
  user: JwtPayload | null | undefined,
  app: AppPermissionKey,
  permissions: Permission[],
): boolean {
  if (!user) return false
  if (user.isPlatformAdmin) return true
  return permissions.some(p => hasPermission(user, app, p))
}

export function hasAllPermissions(
  user: JwtPayload | null | undefined,
  app: AppPermissionKey,
  permissions: Permission[],
): boolean {
  if (!user) return false
  if (user.isPlatformAdmin) return true
  if (permissions.length === 0) return true
  return permissions.every(p => hasPermission(user, app, p))
}
