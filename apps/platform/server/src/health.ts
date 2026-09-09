export type HealthResponse =
  | { statusCode: 200; body: { status: 'ok'; app: 'platform'; db: 'connected' } }
  | { statusCode: 503; body: { status: 'error'; app: 'platform'; db: 'disconnected' } }

export async function getHealthResponse(checkDatabase: () => Promise<unknown>): Promise<HealthResponse> {
  try {
    await checkDatabase()
    return { statusCode: 200, body: { status: 'ok', app: 'platform', db: 'connected' } }
  } catch {
    return { statusCode: 503, body: { status: 'error', app: 'platform', db: 'disconnected' } }
  }
}

