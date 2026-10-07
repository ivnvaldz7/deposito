import 'dotenv/config'
import { applyLogisticsSanitization, preflightLogisticsSanitization } from '../routes/ale-bet/logistica-sanitization-service'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const fingerprintIndex = args.indexOf('--fingerprint')
const fingerprint = fingerprintIndex >= 0 ? args[fingerprintIndex + 1] : undefined

async function main(): Promise<void> {
  if (!apply) {
    const manifest = await preflightLogisticsSanitization()
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', ...manifest }, null, 2)}\n`)
    process.exitCode = manifest.safe ? 0 : 2
    return
  }
  if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error('Apply requires --fingerprint <SHA-256 from a green dry-run>')
  }
  const result = await applyLogisticsSanitization(fingerprint)
  process.stdout.write(`${JSON.stringify({ mode: 'apply', ...result }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
