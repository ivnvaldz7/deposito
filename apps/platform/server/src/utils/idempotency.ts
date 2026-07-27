import crypto from 'crypto'
import { Prisma } from '@platform/db'

export function validateIdempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined) {
    return undefined
  }

  const trimmed = key.trim()
  if (trimmed === '' || trimmed.length > 255) {
    throw { status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'El Idempotency-Key no puede estar vacío ni superar los 255 caracteres' }
  }

  return trimmed
}

export function getSingleIdempotencyKey(rawHeaders: string[]): string | undefined {
  let count = 0
  let key: string | undefined

  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'idempotency-key') {
      count++
      key = rawHeaders[i + 1]
    }
  }

  if (count === 0) {
    return undefined
  }

  if (count > 1) {
    throw { status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Múltiples headers Idempotency-Key no permitidos' }
  }

  return validateIdempotencyKey(key)
}

export function canonicalizeJson(value: unknown, seen = new WeakSet<object>()): string {
  if (value === undefined) throw new Error('Valor no serializable encontrado: undefined')
  if (value === null) return 'null'

  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Valor numérico no serializable')
    return String(value)
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('JSON_CYCLIC_REFERENCE')
    }
    seen.add(value)

    if (Array.isArray(value)) {
      const items = value.map(v => canonicalizeJson(v, seen))
      seen.delete(value)
      return `[${items.join(',')}]`
    }

    const proto = Object.getPrototypeOf(value)
    if (proto !== null && proto !== Object.prototype) {
      throw new Error('Solo se admiten objetos planos')
    }

    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const entries = []

    for (const k of keys) {
      entries.push(`${JSON.stringify(k)}:${canonicalizeJson(obj[k], seen)}`)
    }

    seen.delete(value)
    return `{${entries.join(',')}}`
  }

  throw new Error(`Valor no serializable encontrado: ${typeof value}`)
}

export function calculateFingerprint(method: string, scope: string, entityId: string, rawBody: unknown): string {
  const bodyCanonicalizado = canonicalizeJson(rawBody)

  const payload = JSON.stringify({
    method: method.toUpperCase(),
    scope,
    entityId,
    body: bodyCanonicalizado
  })

  return crypto.createHash('sha256').update(payload).digest('hex')
}

// Convert business response body to valid JSON for persistence, filtering out known secrets.
// In this case, we rely on the input being purely data. We typecheck against Prisma.InputJsonValue.
export function toPersistableResponseBody(response: unknown): Prisma.InputJsonValue {
  const sanitize = (obj: unknown, seen = new WeakSet<object>()) => {
    if (!obj || typeof obj !== 'object') return
    if (seen.has(obj)) throw new Error('JSON_CYCLIC_REFERENCE')
    seen.add(obj)

    const FORBIDDEN_KEYS = new Set(['passwordhash', 'jwt', 'token', 'refreshtoken', 'cookie', 'secret'])
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new Error(`Se detectó una clave prohibida en el DTO: ${key}`)
      }
      sanitize((obj as Record<string, unknown>)[key], seen)
    }
  }

  sanitize(response)
  return response as Prisma.InputJsonValue
}

// Result types
export type IdempotentAcquisitionResult =
  | { type: 'PROPRIETARY', id: string }
  | { type: 'REPLAY', status: number, body: Prisma.JsonValue }

export async function acquireIdempotencyRecord(
  tx: Prisma.TransactionClient,
  actorId: string,
  scope: string,
  idempotencyKey: string,
  requestHash: string
): Promise<IdempotentAcquisitionResult> {
  const id = crypto.randomUUID()

  // Attempt to insert. If conflicts, PostgreSQL will block until the proprietary transaction resolves,
  // then do nothing and return 0 rows.
  const insertResult = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO platform.idempotency_records (
      "id", "actorId", "scope", "idempotencyKey", "requestHash", "status", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${actorId}, ${scope}, ${idempotencyKey}, ${requestHash}, 'PROCESSING', NOW(), NOW()
    )
    ON CONFLICT ("actorId", "scope", "idempotencyKey") DO NOTHING
    RETURNING "id";
  `

  if (insertResult.length > 0) {
    // We are the proprietor
    return { type: 'PROPRIETARY', id: insertResult[0].id }
  }

  // We are not the proprietor. The conflicting transaction must have resolved (or we wouldn't have awoken).
  // Fetch the record.
  const existing = await tx.$queryRaw<{ requestHash: string, status: string, responseStatus: number | null, responseBody: Prisma.JsonValue | null }[]>`
    SELECT "requestHash", "status", "responseStatus", "responseBody"
    FROM platform.idempotency_records
    WHERE "actorId" = ${actorId}
      AND "scope" = ${scope}
      AND "idempotencyKey" = ${idempotencyKey};
  `

  if (existing.length === 0) {
    // Edge case: someone deleted it right after our DO NOTHING, or we are experiencing an anomaly.
    throw { status: 500, code: 'IDEMPOTENCY_ANOMALY', message: 'No se pudo adquirir ni encontrar el registro.' }
  }

  const record = existing[0]

  if (record.requestHash !== requestHash) {
    throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Clave de idempotencia reutilizada con distinto payload' }
  }

  if (record.status !== 'COMPLETED' || record.responseStatus === null || record.responseBody === null) {
    // Since we blocked on DO NOTHING, if it's still PROCESSING, the proprietor likely failed and rolled back...
    // WAIT! If the proprietor rolled back, the DO NOTHING would actually have INSERTED!
    // Because if the proprietor rolled back, the conflict goes away. So if we reached here, the proprietor COMMITTED!
    // But what if it committed with PROCESSING state? That means it was a corrupt state or bug.
    throw { status: 500, code: 'IDEMPOTENCY_PROCESSING_STATE', message: 'Registro de idempotencia encontrado en estado PROCESSING después de commit. Esto indica datos corruptos.' }
  }

  return { type: 'REPLAY', status: record.responseStatus, body: record.responseBody }
}

export async function completeIdempotencyRecord(
  tx: Prisma.TransactionClient,
  id: string,
  responseStatus: number,
  responseBody: Prisma.InputJsonValue
): Promise<void> {
  const result = await tx.$executeRaw`
    UPDATE platform.idempotency_records
    SET "status" = 'COMPLETED',
        "responseStatus" = ${responseStatus},
        "responseBody" = ${responseBody},
        "completedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = ${id} AND "status" = 'PROCESSING'
  `
  if (result !== 1) {
    throw new Error('Error al completar el registro de idempotencia: el registro no estaba en estado PROCESSING o no existe.')
  }
}
