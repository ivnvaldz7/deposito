import { PrismaClient } from '@platform/db'
import { Client } from 'pg'
import crypto from 'crypto'

export async function truncateDb(prisma: PrismaClient) {
  // Query all tables in our schemas
  const tables = await prisma.$queryRaw<Array<{ table_schema: string, table_name: string }>>`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('platform', 'ale_bet', 'deposito')
      AND table_type = 'BASE TABLE'
      AND table_name != '_prisma_migrations';
  `

  for (const { table_schema, table_name } of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table_schema}"."${table_name}" CASCADE;`)
  }
}

/**
 * Creates a deterministic sync barrier using a BEFORE UPDATE trigger and pg_advisory_lock.
 * This guarantees two overlapping requests will reach the critical DB point before proceeding.
 */
export class SyncBarrier {
  private pgClient: Client | null = null;
  private readonly lockId: number;
  private readonly suffix: string;

  constructor(private dbUrl: string, private schema: string, private table: string, private operation: 'UPDATE' | 'INSERT' = 'UPDATE') {
    // Generar un lockId único por instancia (rango de 32 bits para advisory_lock)
    this.lockId = crypto.randomInt(1, 2000000000);
    this.suffix = crypto.randomBytes(4).toString('hex');
  }

  getFunctionName() {
    return `test_pause_trigger_${this.table.toLowerCase()}_${this.suffix}`
  }

  async setup() {
    this.pgClient = new Client({ connectionString: this.dbUrl })
    await this.pgClient.connect()

    // 1. Acquire the exclusive lock immediately in our control connection
    await this.pgClient.query(`SELECT pg_advisory_lock(${this.lockId})`)

    // 2. Setup the trigger in the DB
    const functionName = `test_pause_trigger_${this.table.toLowerCase()}_${this.suffix}`
    const triggerName = `test_pause_before_${this.operation.toLowerCase()}_${this.table.toLowerCase()}_${this.suffix}`

    // Usamos pg_advisory_xact_lock_shared para:
    // a. Esperar hasta que se libere el lock exclusivo del control.
    // b. Permitir que múltiples requests lo adquieran simultáneamente (shared).
    // c. Liberarse automáticamente al finalizar la transacción (xact).
    await this.pgClient.query(`
      CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock_shared(${this.lockId});
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    await this.pgClient.query(`
      DROP TRIGGER IF EXISTS ${triggerName} ON "${this.schema}"."${this.table}";
      CREATE TRIGGER ${triggerName}
      BEFORE ${this.operation} ON "${this.schema}"."${this.table}"
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `)
  }

  async waitForBlockedCount(expectedCount: number, timeoutMs = 5000): Promise<void> {
    const start = Date.now()
    if (!this.pgClient) throw new Error('Not setup')

    while (Date.now() - start < timeoutMs) {
      const res = await this.pgClient.query(`
        SELECT count(*)
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND granted = false
      `)
      if (parseInt(res.rows[0].count) >= expectedCount) {
        return
      }
      await new Promise(r => setTimeout(r, 50))
    }
    throw new Error(`Timeout waiting for ${expectedCount} blocked queries.`)
  }

  async releaseAndTeardown() {
    if (!this.pgClient) return

    try {
      const functionName = `test_pause_trigger_${this.table.toLowerCase()}_${this.suffix}`
      const triggerName = `test_pause_before_${this.operation.toLowerCase()}_${this.table.toLowerCase()}_${this.suffix}`

      // Remove trigger first so no new queries are affected
      await this.pgClient.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "${this.schema}"."${this.table}";`)
      await this.pgClient.query(`DROP FUNCTION IF EXISTS ${functionName}();`)

      // Release exclusive lock, letting blocked queries proceed simultaneously
      await this.pgClient.query(`SELECT pg_advisory_unlock(${this.lockId})`)
    } finally {
      await this.pgClient.end()
      this.pgClient = null
    }
  }
}
