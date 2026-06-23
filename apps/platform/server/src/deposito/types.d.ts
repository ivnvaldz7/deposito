export {}

declare global {
  namespace Express {
    interface Request {
      depositoUser?: {
        id: string
        role: string
        name: string
        email: string
      }
    }
  }
}
