export { signToken, verifyToken, decodeToken, APP_SLUG_BY_ID, getAppAccess } from './auth/jwt'
export {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken as decodeAccessToken,
} from './auth/jwt'
export type { JwtPayload, RefreshTokenPayload, AppIdEnum, AppSlug } from './auth/jwt'
export type { AuthProvider, AuthUser } from './auth/provider'
export { hashPassword, comparePassword } from './auth/password'
export { validatePasswordPolicy, PasswordPolicyError, MIN_PASSWORD_LENGTH } from './auth/password-policy'
export { hashRefreshToken } from './auth/token-hash'
export {
  verifyToken as verifyTokenMiddleware,
  requireApp,
  requirePlatformAdmin,
} from './auth/middleware'
export {
  createUser,
  getUserById,
  getUserByEmail,
  listUsers,
  updateAppAccess,
  removeAppAccess,
  deactivateUser,
} from './users/service'
export { APP_ROLES, isValidAppRole, type AppRoleKey } from './users/roles'
export { PLATFORM_AUDIT_ACTIONS, type PlatformAuditAction } from './users/audit-actions'
export * from './notifications'
