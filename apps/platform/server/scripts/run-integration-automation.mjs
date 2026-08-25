import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const AUTOMATION_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/platform_test_automation'
const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vitestCli = resolve(serverDirectory, 'node_modules/vitest/vitest.mjs')
const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', '-c', resolve(serverDirectory, 'vitest.integration.config.ts'), ...process.argv.slice(2)],
  {
    cwd: serverDirectory,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_TEST_DB_RESET: 'true',
      DATABASE_URL: AUTOMATION_DATABASE_URL,
      PLATFORM_DATABASE_URL: AUTOMATION_DATABASE_URL,
    },
    stdio: 'inherit',
  },
)

process.exitCode = result.status ?? 1
