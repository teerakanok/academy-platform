import { createPrivateKey } from 'node:crypto'
import { createCoreTransport } from './core-transport.mjs'
import { exportAttemptProfileCycle, postgresProfileResultStore } from './export-cycle.mjs'

async function run() {
  // No credential, database or network access occurs unless explicitly enabled by an operator.
  if (process.env.ACADEMY_CORE_EXPORT_ENABLED !== '1') {
    process.stdout.write('{"status":"disabled"}\n')
    return
  }
  const { Client } = await import('pg')
  const transport = createCoreTransport({ enabled: true, origin: process.env.ACADEMY_CORE_ORIGIN,
    clientId: process.env.ACADEMY_CORE_CLIENT_ID, keyId: process.env.ACADEMY_CORE_KEY_ID,
    privateKey: createPrivateKey(process.env.ACADEMY_CORE_PRIVATE_KEY_PEM ?? ''),
    environment: process.env.ACADEMY_CORE_AUTH_ENVIRONMENT })
  const trustedIssuer = process.env.ACADEMY_CORE_PRINCIPAL_ISSUER
  if (!trustedIssuer || !process.env.ACADEMY_PROFILE_DATABASE_URL) throw new Error('profile exporter configuration incomplete')
  const db = new Client({ connectionString: process.env.ACADEMY_PROFILE_DATABASE_URL })
  try {
    await db.connect()
    const result = await exportAttemptProfileCycle({ store: postgresProfileResultStore(db), transport, trustedIssuer })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally { await db.end() }
}

try { await run() } catch {
  // Configuration, database and fetch errors can contain credentials or PII.
  process.stderr.write('Academy profile export failed; source rows remain pending\n')
  process.exitCode = 1
}
