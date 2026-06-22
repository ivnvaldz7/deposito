import type { AuthProvider, AuthUser } from '@platform/core'

interface GoogleTokenResponse {
  access_token: string
  id_token: string
  expires_in: number
  token_type: string
  refresh_token?: string
}

interface GoogleUserInfo {
  sub: string
  email: string
  name: string
  picture?: string
}

interface GoogleTokenInfo {
  sub: string
  email: string
  name: string
  picture?: string
  aud: string
  exp: number
  iat: number
}

export class GoogleStrategy implements AuthProvider {
  name = 'google'

  private get clientId(): string {
    const id = process.env.GOOGLE_CLIENT_ID
    if (!id) throw new Error('GOOGLE_CLIENT_ID no está configurado')
    return id
  }

  private get clientSecret(): string {
    const secret = process.env.GOOGLE_CLIENT_SECRET
    if (!secret) throw new Error('GOOGLE_CLIENT_SECRET no está configurado')
    return secret
  }

  private get redirectUri(): string {
    return (
      process.env.GOOGLE_REDIRECT_URI ??
      'http://localhost:3000/api/auth/google/callback'
    )
  }

  async getAuthUrl(state: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'profile email',
      state,
      access_type: 'offline',
      prompt: 'consent',
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  async exchangeCode(code: string): Promise<AuthUser> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!tokenResponse.ok) {
      throw new Error('Google OAuth: intercambio de código falló')
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse

    const userResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    )

    if (!userResponse.ok) {
      throw new Error('Google OAuth: obtener información del usuario falló')
    }

    const userData = (await userResponse.json()) as GoogleUserInfo

    return {
      providerId: userData.sub,
      email: userData.email,
      name: userData.name,
      avatar: userData.picture,
    }
  }

  async validateToken(token: string): Promise<AuthUser | null> {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`
      )

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as GoogleTokenInfo

      return {
        providerId: data.sub,
        email: data.email,
        name: data.name,
        avatar: data.picture,
      }
    } catch {
      return null
    }
  }
}
