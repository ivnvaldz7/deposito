export interface AuthUser {
  providerId: string
  email: string
  name: string
  avatar?: string
}

export interface AuthProvider {
  name: string
  getAuthUrl(state: string): Promise<string>
  exchangeCode(code: string): Promise<AuthUser>
  validateToken(token: string): Promise<AuthUser | null>
}
