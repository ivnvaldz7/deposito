import { Router } from 'express'
import { platformDb } from '@platform/db'
import { verifyRefreshToken, hashRefreshToken } from '@platform/core'
import { findSessionByTokenHash, revokeSession } from '../../services/auth/session-service'
import { auditAdminEvent } from '../../services/audit/platform-audit-service'
import { PLATFORM_AUDIT_ACTIONS } from '@platform/core'

const router = Router()

const REFRESH_COOKIE_NAME = 'platform_refresh_token'

function getCookieValue(req: any, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw) return null

  for (const part of raw.split(';')) {
    const [cookieName, ...rest] = part.trim().split('=')
    if (cookieName === name) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

function clearRefreshTokenCookie(res: any): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
  })
}

// POST /api/auth/logout — revoke current session and clear cookie
router.post('/logout', async (req, res) => {
  const refreshToken = getCookieValue(req, REFRESH_COOKIE_NAME)
  const ip = req.ip ?? req.socket.remoteAddress ?? undefined
  const userAgent = req.headers['user-agent'] ?? undefined

  if (refreshToken) {
    const payload = verifyRefreshToken(refreshToken)
    const session = payload
      ? await findSessionByTokenHash(platformDb as any, hashRefreshToken(refreshToken))
      : null

    if (session && session.id === payload?.sid && !session.revokedAt) {
      await revokeSession(platformDb as any, session.id)
      await auditAdminEvent(platformDb as any, {
        actorId: session.platformUserId,
        targetUserId: session.platformUserId,
        action: PLATFORM_AUDIT_ACTIONS.LOGOUT,
        previous: { sessionId: session.id },
        ip,
        userAgent,
      }).catch(() => undefined)
    }
  }

  clearRefreshTokenCookie(res)
  res.status(204).send()
})

export default router
