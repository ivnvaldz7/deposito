export interface DbConstraintViolation {
  code: string
  constraintName?: string
}

const INVENTORY_ALLOWLIST = [
  'chk_inv_drogas_cantidad_no_negativa',
  'chk_inv_estuches_cantidad_no_negativa',
  'chk_inv_etiquetas_cantidad_no_negativa',
  'chk_inv_frascos_cajas_no_negativa'
] as const

function extractConstraintFromMessage(message: unknown): string | undefined {
  if (typeof message !== 'string') return undefined
  // Regex específico como último fallback, aislado y seguro.
  // Busca las constraints permitidas exactas.
  for (const allowed of INVENTORY_ALLOWLIST) {
    if (message.includes(allowed)) {
      return allowed
    }
  }
  return undefined
}

export function extractDbConstraintViolation(error: unknown): DbConstraintViolation | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const err = error as Record<string, unknown>
  let code: string | undefined = undefined
  let constraintName: string | undefined = undefined

  // 1. Propiedades estructuradas del error directo (ej. query raw genérico)
  if (typeof err.code === 'string') {
    code = err.code
  }

  // 2. Propiedades estructuradas de cause (Prisma DriverAdapterError)
  if (err.cause && typeof err.cause === 'object') {
    const cause = err.cause as Record<string, unknown>
    if (typeof cause.code === 'string') {
      code = cause.code
    }
    // Postgres native constraint name field if available
    if (typeof cause.constraint === 'string') {
      constraintName = cause.constraint
    }
    if (!constraintName && typeof cause.message === 'string') {
       constraintName = extractConstraintFromMessage(cause.message)
    }
  }

  // 3. Metadatos estructurados del adaptador (PrismaClientKnownRequestError con P2010 o P2004)
  if (err.meta && typeof err.meta === 'object') {
    const meta = err.meta as Record<string, unknown>
    
    // Prisma P2004 expone constraint en meta.constraint
    if (typeof meta.constraint === 'string') {
      constraintName = meta.constraint
    }

    if (meta.driverAdapterError && typeof meta.driverAdapterError === 'object') {
      const adapterErr = meta.driverAdapterError as Record<string, unknown>
      if (adapterErr.cause && typeof adapterErr.cause === 'object') {
        const nestedCause = adapterErr.cause as Record<string, unknown>
        if (typeof nestedCause.code === 'string') {
          code = nestedCause.code
        }
        if (typeof nestedCause.constraint === 'string') {
          constraintName = nestedCause.constraint
        }
        if (!constraintName && typeof nestedCause.message === 'string') {
          constraintName = extractConstraintFromMessage(nestedCause.message)
        }
      }
    }
  }

  // Si no se encontró código, fallback a P2004/23514 detectado por prisma
  if (!code && typeof err.code === 'string' && err.code === 'P2004') {
    code = '23514'
  }

  if (code === '23514') {
    return { code, constraintName }
  }

  return undefined
}

type InventoryConstraintName = (typeof INVENTORY_ALLOWLIST)[number]

export function isKnownInventoryConflict(constraintName?: string): constraintName is InventoryConstraintName {
  if (!constraintName) return false
  return INVENTORY_ALLOWLIST.some(knownConstraint => knownConstraint === constraintName)
}
