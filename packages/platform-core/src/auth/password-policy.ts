export const MIN_PASSWORD_LENGTH = 8

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordPolicyError'
  }
}

export function validatePasswordPolicy(plain: string): void {
  if (!plain || plain.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  }
}
