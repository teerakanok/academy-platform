#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const academyRoot = resolve(scriptDirectory, '..', '..')
const identityRoot = resolve(academyRoot, '..', 'identity-control')

export const ACADEMY_SOURCE_REVISION = '845e371173efb7b15b7605ecbc9496c47e2068fb'
export const IDENTITY_SOURCE_REVISION = 'a6ef1f430e1939a76fdccdcc35a1da41ff7a4606'

const reportPath = 'reports/conformance/identity-control/academy-identity-control-conformance.json'
const evidencePath = 'reports/conformance/identity-control/academy-identity-local-evidence.json'
const unprovenPath = 'reports/conformance/identity-control/academy-identity-unproven-scenarios.json'

export const CHECKPOINT_FREEZE_DECLARATION = Object.freeze({
  schema: 'checkpoint-freeze-manifest.v1',
  role: 'identity-consumer-conformance-checkpoint',
  path: 'reports/reviews/academy-identity-control-conformance-ledger-refresh-freeze-20260810.json',
  contentPaths: Object.freeze([
    'academy-web/scripts/generate-identity-control-conformance.mjs',
    'academy-web/scripts/generate-identity-control-conformance.test.mjs',
    'plans/active_plan.md',
    'plans/completed_log.md',
    reportPath,
    evidencePath,
    unprovenPath,
    'reports/reviews/academy-identity-control-conformance-ledger-refresh-local-checkpoint-2026-08-10.md',
  ]),
})

const identityContractDigests = Object.freeze({
  'config/consumer-registry-v1.approved.json': '572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875',
  'docs/integration/consumer-registry-v1.md': 'd880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4',
  'docs/integration/consumer-conformance-kit.md': 'd49d25592785c38dbebadd0ec7ed87088fd215478a0c57d3d7306f8af7c96ad0',
  'docs/integration/lifecycle-pull-consumer-contract.md': '7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5',
  'packages/contracts/src/index.ts': '74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6',
  'packages/testing/src/index.ts': 'f2b7fc3c417104a9c9d5bf2adfed4178fb67226167ed143927939c353f6942f9',
})

const expectedEvidenceDigests = new Map([
  [
    'reports/conformance/identity-control/academy-identity-unit-conformance.txt',
    '2f3e45ba63c978a6f730873ca6c0aa619064a9d0d6145594fee9cfe668051fc1',
  ],
  [
    'reports/reviews/identity-control-conformance-ril-2026-08-08.md',
    '62f44a6e81a77ababeacbc063f1e4d5d8509b3c5239406f45f4a9af7e7573c4b',
  ],
  [
    'reports/conformance/identity-control/academy-lifecycle-envelope-local-conformance.json',
    '152b159f88a603028d3bbed80136a89c326a6eafc880fe5751aa16295245c4d1',
  ],
  [
    'reports/reviews/academy-identity-lifecycle-envelope-local-conformance-2026-08-09.md',
    'b32fa794f721e06ce4ca830128262d77acf160a4c28a89b3c07586c70b1ed165',
  ],
  [
    'reports/reviews/academy-identity-lifecycle-reducer-local-checkpoint-2026-08-09.md',
    '0828c7467e7d96190d31a6758cb6b413b1dbd957786cd0cd645be718992e7fb2',
  ],
  [
    'reports/reviews/academy-identity-lifecycle-page-store-local-checkpoint-2026-08-10.md',
    '6685acf996b69c4901c9a13fec725c69113b9993bbdd4e9321e13cb53db79093',
  ],
  [
    'reports/reviews/academy-identity-lifecycle-pull-lease-local-checkpoint-2026-08-10.md',
    '79a703286d06064505ce9bd51aaf8185825344f733d90eed36cb7e5d4c112f8f',
  ],
  [
    'reports/reviews/academy-identity-lifecycle-pull-lease-m01-freeze-20260810.json',
    'a8599a1d1f5624238b85c85b3692d5886f58650af4bd7dbb9fae56e7a9c6570e',
  ],
  [
    'reports/reviews/academy-identity-lifecycle-pull-cycle-local-checkpoint-2026-08-10.md',
    '64dd594cb590dc856094c3d28bab75b4034a65d8e5c5faf928417fd99972b971',
  ],
  [
    'reports/reviews/academy-identity-lifecycle-pull-cycle-freeze-20260810.json',
    '550b02f9d692ad9c3734397ad72624667afb644c668704adea5cc1cc5f16e065',
  ],
])

const retainedScenarioIds = Object.freeze([
  'authorization.state-expiry-replay',
  'callback.code-and-state-only',
  'callback.server-held-intent',
  'exchange.pkce-s256',
  'exchange.result-binding',
  'session.host-scoped',
  'activation.grants-zero-product-access',
  'outage.fail-closed',
  'academy.course-entitlement',
])

export const LIFECYCLE_SCENARIO_IDS = Object.freeze([
  'lifecycle.envelope-cryptographic-verification',
  'lifecycle.duplicate-stale',
  'lifecycle.gap-conflict',
  'lifecycle.config-revision-change',
  'lifecycle.cursor-after-commit',
])

export const NOT_PROVEN_SCENARIO_IDS = Object.freeze([
  'authorization.exact-registered-redirect',
  'authorization.state-binding-mismatch',
  'callback.login-csrf',
  'callback.origin-fetch-metadata',
  'exchange.client-assertion',
  'exchange.code-replay-expiry',
  'exchange.result-key-rotation',
  'academy.activation-profile-only',
  'academy.canonical-founder-bootstrap',
])

const allScenarioIds = Object.freeze([
  'authorization.exact-registered-redirect',
  'authorization.state-binding-mismatch',
  'authorization.state-expiry-replay',
  'callback.code-and-state-only',
  'callback.server-held-intent',
  'callback.login-csrf',
  'callback.origin-fetch-metadata',
  'exchange.pkce-s256',
  'exchange.client-assertion',
  'exchange.result-binding',
  'exchange.code-replay-expiry',
  'exchange.result-key-rotation',
  'session.host-scoped',
  'activation.grants-zero-product-access',
  ...LIFECYCLE_SCENARIO_IDS,
  'outage.fail-closed',
  'academy.activation-profile-only',
  'academy.course-entitlement',
  'academy.canonical-founder-bootstrap',
])

const unprovenReasons = Object.freeze({
  'authorization.exact-registered-redirect': 'The production authorization entry point is unwired and has no deployed exact-redirect evidence.',
  'authorization.state-binding-mismatch': 'The production authorization entry point is unwired and has no deployed browser transaction-binding evidence.',
  'callback.login-csrf': 'The production callback and session path is unwired, so login-session swapping is not proven.',
  'callback.origin-fetch-metadata': 'Academy does not yet enforce the released Origin and Fetch Metadata mutation policy at a production callback.',
  'exchange.client-assertion': 'No operational signer, registered public key, replay store, or released exchange endpoint is configured.',
  'exchange.code-replay-expiry': 'Local units cover replay and expiry pieces, but the released end-to-end exchange contract is not deployed.',
  'exchange.result-key-rotation': 'No released Identity Control result-key distribution or active/overlap rotation path is wired.',
  'academy.activation-profile-only': 'The production callback and profile activation transaction remains unwired.',
  'academy.canonical-founder-bootstrap': 'Founder bootstrap still requires a canonical production sign-in and separate owner operation.',
})

const checkpointDefinitions = Object.freeze([
  {
    id: 'envelope-verifier',
    reportPath: 'reports/reviews/academy-identity-lifecycle-envelope-local-conformance-2026-08-09.md',
    receiptPath: 'reports/conformance/identity-control/academy-lifecycle-envelope-local-conformance.json',
    scenarios: ['lifecycle.envelope-cryptographic-verification'],
  },
  {
    id: 'projection-reducer',
    reportPath: 'reports/reviews/academy-identity-lifecycle-reducer-local-checkpoint-2026-08-09.md',
    scenarios: ['lifecycle.duplicate-stale', 'lifecycle.gap-conflict'],
  },
  {
    id: 'durable-page-store',
    reportPath: 'reports/reviews/academy-identity-lifecycle-page-store-local-checkpoint-2026-08-10.md',
    scenarios: [
      'lifecycle.duplicate-stale',
      'lifecycle.gap-conflict',
      'lifecycle.config-revision-change',
      'lifecycle.cursor-after-commit',
    ],
  },
  {
    id: 'pull-lease',
    reportPath: 'reports/reviews/academy-identity-lifecycle-pull-lease-local-checkpoint-2026-08-10.md',
    manifestPath: 'reports/reviews/academy-identity-lifecycle-pull-lease-m01-freeze-20260810.json',
    scenarios: ['lifecycle.cursor-after-commit'],
  },
  {
    id: 'pure-pull-cycle',
    reportPath: 'reports/reviews/academy-identity-lifecycle-pull-cycle-local-checkpoint-2026-08-10.md',
    manifestPath: 'reports/reviews/academy-identity-lifecycle-pull-cycle-freeze-20260810.json',
    scenarios: ['lifecycle.config-revision-change', 'lifecycle.cursor-after-commit'],
  },
])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function renderCanonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function assertSourceBoundEvidence(observedEvidenceDigests) {
  if (!(observedEvidenceDigests instanceof Map)) {
    throw new TypeError('observed evidence digests must be a Map')
  }
  if (observedEvidenceDigests.size !== expectedEvidenceDigests.size) {
    throw new Error('source-bound evidence file set mismatch')
  }
  for (const [path, expected] of expectedEvidenceDigests) {
    if (observedEvidenceDigests.get(path) !== expected) {
      throw new Error(`source-bound evidence digest mismatch: ${path}`)
    }
  }
}

function artifactReference(path, observedEvidenceDigests) {
  return { path, sha256: observedEvidenceDigests.get(path) }
}

function buildEvidence(observedEvidenceDigests) {
  const checkpoints = checkpointDefinitions.map((checkpoint) => ({
    id: checkpoint.id,
    verdict: 'C0/H0/M0/L0',
    report: artifactReference(checkpoint.reportPath, observedEvidenceDigests),
    ...(checkpoint.receiptPath
      ? { receipt: artifactReference(checkpoint.receiptPath, observedEvidenceDigests) }
      : {}),
    ...(checkpoint.manifestPath
      ? { freezeManifest: artifactReference(checkpoint.manifestPath, observedEvidenceDigests) }
      : {}),
    scenarios: [...checkpoint.scenarios],
  }))

  return {
    schema: 'academy-identity-control-local-evidence/v1',
    sourceRevision: ACADEMY_SOURCE_REVISION,
    identityControlSourceRevision: IDENTITY_SOURCE_REVISION,
    registryEnabled: false,
    releaseApproval: false,
    runtimeWired: false,
    retainedLocalEvidence: {
      scenarios: [...retainedScenarioIds],
      testArtifact: artifactReference(
        'reports/conformance/identity-control/academy-identity-unit-conformance.txt',
        observedEvidenceDigests,
      ),
      independentReview: artifactReference(
        'reports/reviews/identity-control-conformance-ril-2026-08-08.md',
        observedEvidenceDigests,
      ),
    },
    checkpoints,
    scenarios: LIFECYCLE_SCENARIO_IDS.map((id) => ({
      id,
      result: 'pass',
      checkpointIds: checkpoints
        .filter((checkpoint) => checkpoint.scenarios.includes(id))
        .map((checkpoint) => checkpoint.id),
    })),
    limitations: [
      'No Identity Control endpoint, key distribution, audience, or authenticated transport is configured.',
      'No Academy runtime route, scheduler, session flow, or production database is wired by this evidence.',
      'Local checkpoint evidence does not enable the registry or approve a release.',
    ],
  }
}

function buildUnproven() {
  return {
    schema: 'academy-identity-control-unproven-scenarios/v2',
    sourceRevision: ACADEMY_SOURCE_REVISION,
    identityControlSourceRevision: IDENTITY_SOURCE_REVISION,
    command: 'academy-identity-control-unproven-v2',
    result: 'not_proven',
    scenarios: Object.fromEntries(
      NOT_PROVEN_SCENARIO_IDS.map((id) => [id, unprovenReasons[id]]),
    ),
    registryEnabled: false,
    releaseApproval: false,
    productionMutation: false,
  }
}

function evidenceRecord(id, result, artifactPath, artifactSha256, command) {
  return {
    id,
    result,
    evidence: {
      testId: id,
      command,
      sourceRevision: ACADEMY_SOURCE_REVISION,
      artifactPath,
      artifactSha256,
      ...(result === 'not_proven' ? { supportsClaim: false } : {}),
    },
  }
}

function buildReport({
  localWorkingTreeReceipt,
  identityControlLocalArtifactReceipt,
  evidenceSha256,
  unprovenSha256,
}) {
  const retained = new Set(retainedScenarioIds)
  const lifecycle = new Set(LIFECYCLE_SCENARIO_IDS)
  const unproven = new Set(NOT_PROVEN_SCENARIO_IDS)
  const scenarios = allScenarioIds.map((id) => {
    if (retained.has(id)) {
      return evidenceRecord(
        id,
        'pass',
        'reports/conformance/identity-control/academy-identity-unit-conformance.txt',
        expectedEvidenceDigests.get(
          'reports/conformance/identity-control/academy-identity-unit-conformance.txt',
        ),
        'academy-identity-control-local-v1',
      )
    }
    if (lifecycle.has(id)) {
      return evidenceRecord(
        id,
        'pass',
        evidencePath,
        evidenceSha256,
        'academy-identity-lifecycle-checkpoints-v1',
      )
    }
    if (unproven.has(id)) {
      return evidenceRecord(
        id,
        'not_proven',
        unprovenPath,
        unprovenSha256,
        'academy-identity-control-unproven-v2',
      )
    }
    throw new Error(`scenario classification missing: ${id}`)
  })

  return {
    schema: 'identity-consumer-conformance-report/v1',
    registryRevision: 1,
    clientId: 'academy-web',
    sourceRevision: ACADEMY_SOURCE_REVISION,
    checkpointFreezeManifest: CHECKPOINT_FREEZE_DECLARATION,
    localWorkingTreeReceipt,
    identityControl: {
      sourceRevision: IDENTITY_SOURCE_REVISION,
      contractDigests: identityContractDigests,
      localArtifactReceipt: identityControlLocalArtifactReceipt,
    },
    registryState: {
      enabled: false,
      activationPolicy: 'open',
      serviceId: 'academy',
      productionClientStartup: 'fail-closed',
    },
    scope: {
      classification: 'local-conformance-evidence-only',
      releaseApproval: false,
      runtimeWired: false,
      productionEvidence: false,
      statement: 'This report records source-bound Academy-local evidence. It does not configure Identity Control, enable the disabled consumer, wire runtime traffic, or authorize production release.',
    },
    reviewedEvidence: [
      {
        commandId: 'academy-identity-control-local-v1',
        result: 'pass',
        artifactPath: 'reports/conformance/identity-control/academy-identity-unit-conformance.txt',
        artifactSha256: expectedEvidenceDigests.get(
          'reports/conformance/identity-control/academy-identity-unit-conformance.txt',
        ),
      },
      {
        commandId: 'academy-identity-lifecycle-checkpoints-v1',
        result: 'pass',
        artifactPath: evidencePath,
        artifactSha256: evidenceSha256,
      },
      {
        commandId: 'academy-identity-control-unproven-v2',
        result: 'not_proven',
        artifactPath: unprovenPath,
        artifactSha256: unprovenSha256,
      },
    ],
    canonicalIntake: {
      required: true,
      checkpointManifestRequired: true,
      releaseEvidence: false,
    },
    scenarios,
    summary: {
      trackedScenarioCount: 23,
      provenLocally: 14,
      notProven: 9,
      productionReady: false,
      noProductionMutation: true,
    },
  }
}

export function buildGeneratedArtifacts({
  localWorkingTreeReceipt,
  identityControlLocalArtifactReceipt,
  observedEvidenceDigests,
}) {
  assertSourceBoundEvidence(observedEvidenceDigests)
  const evidence = buildEvidence(observedEvidenceDigests)
  const unproven = buildUnproven()
  const evidenceSha256 = sha256(renderCanonicalJson(evidence))
  const unprovenSha256 = sha256(renderCanonicalJson(unproven))
  const report = buildReport({
    localWorkingTreeReceipt,
    identityControlLocalArtifactReceipt,
    evidenceSha256,
    unprovenSha256,
  })
  return { evidence, unproven, report }
}

function readRegularFile(root, path) {
  const absolute = join(root, path)
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`evidence path is not a regular file: ${path}`)
  }
  return readFileSync(absolute)
}

function collectEvidenceDigests() {
  return new Map(
    [...expectedEvidenceDigests].map(([path]) => [path, sha256(readRegularFile(academyRoot, path))]),
  )
}

function gitHead(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function assertSourceRevisions() {
  if (gitHead(academyRoot) !== ACADEMY_SOURCE_REVISION) {
    throw new Error('Academy source revision mismatch')
  }
  if (gitHead(identityRoot) !== IDENTITY_SOURCE_REVISION) {
    throw new Error('Identity Control source revision mismatch')
  }
  for (const [path, expected] of Object.entries(identityContractDigests)) {
    const observed = sha256(readRegularFile(identityRoot, path))
    if (observed !== expected) throw new Error(`Identity Control contract digest mismatch: ${path}`)
  }
}

function atomicWrite(path, bytes) {
  const absolute = join(academyRoot, path)
  mkdirSync(dirname(absolute), { recursive: true })
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`
  try {
    writeFileSync(temporary, bytes, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
    renameSync(temporary, absolute)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function receiptArguments() {
  return [
    join(identityRoot, 'scripts', 'intake-consumer-conformance.mjs'),
    '--consumer-root', academyRoot,
    '--report', join(academyRoot, reportPath),
    '--identity-root', identityRoot,
    '--identity-source', IDENTITY_SOURCE_REVISION,
    '--checkpoint-freeze-manifest', JSON.stringify(CHECKPOINT_FREEZE_DECLARATION),
    '--print-local-receipts',
  ]
}

function readReceipts() {
  const output = execFileSync(process.execPath, receiptArguments(), {
    cwd: identityRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60_000,
  })
  const receipts = JSON.parse(output)
  if (!receipts.localWorkingTreeReceipt || !receipts.identityControlLocalArtifactReceipt) {
    throw new Error('Identity Control receipt output is incomplete')
  }
  return receipts
}

function parseCurrentReport() {
  return JSON.parse(readRegularFile(academyRoot, reportPath).toString('utf8'))
}

function artifactsFromCurrentReceipt(observedEvidenceDigests) {
  const current = parseCurrentReport()
  if (JSON.stringify(current.checkpointFreezeManifest) !== JSON.stringify(CHECKPOINT_FREEZE_DECLARATION)) {
    throw new Error('current report checkpoint declaration mismatch')
  }
  const receipts = readReceipts()
  return buildGeneratedArtifacts({
    ...receipts,
    observedEvidenceDigests,
  })
}

function assertCurrentArtifacts(expected) {
  for (const [path, value] of [
    [evidencePath, expected.evidence],
    [unprovenPath, expected.unproven],
    [reportPath, expected.report],
  ]) {
    const actual = readRegularFile(academyRoot, path)
    const wanted = Buffer.from(renderCanonicalJson(value), 'utf8')
    if (!actual.equals(wanted)) throw new Error(`generated artifact is stale: ${path}`)
  }
}

function writeArtifacts(observedEvidenceDigests) {
  const originals = new Map()
  for (const path of [evidencePath, unprovenPath, reportPath]) {
    try {
      originals.set(path, readRegularFile(academyRoot, path))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      originals.set(path, null)
    }
  }

  const evidence = buildEvidence(observedEvidenceDigests)
  const unproven = buildUnproven()
  try {
    atomicWrite(evidencePath, renderCanonicalJson(evidence))
    atomicWrite(unprovenPath, renderCanonicalJson(unproven))
    atomicWrite(reportPath, renderCanonicalJson({
      checkpointFreezeManifest: CHECKPOINT_FREEZE_DECLARATION,
    }))
    const receipts = readReceipts()
    const generated = buildGeneratedArtifacts({
      ...receipts,
      observedEvidenceDigests,
    })
    atomicWrite(reportPath, renderCanonicalJson(generated.report))
    return generated
  } catch (error) {
    for (const [path, bytes] of originals) {
      if (bytes === null) rmSync(join(academyRoot, path), { force: true })
      else atomicWrite(path, bytes)
    }
    throw error
  }
}

function main(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--write')) {
    throw new Error('usage: generate-identity-control-conformance.mjs [--write]')
  }
  assertSourceRevisions()
  const observedEvidenceDigests = collectEvidenceDigests()
  assertSourceBoundEvidence(observedEvidenceDigests)
  if (args[0] === '--write') {
    const generated = writeArtifacts(observedEvidenceDigests)
    process.stdout.write(`${JSON.stringify({
      status: 'written',
      paths: [evidencePath, unprovenPath, reportPath],
      scenarioCount: generated.report.scenarios.length,
    })}\n`)
    return
  }
  const expected = artifactsFromCurrentReceipt(observedEvidenceDigests)
  assertCurrentArtifacts(expected)
  process.stdout.write(`${JSON.stringify({
    status: 'current',
    paths: [evidencePath, unprovenPath, reportPath],
    scenarioCount: expected.report.scenarios.length,
  })}\n`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`Identity conformance generation failed: ${error.message}\n`)
    process.exitCode = 1
  }
}

export const generatorPaths = Object.freeze({
  academyRoot,
  identityRoot,
  reportPath,
  evidencePath,
  unprovenPath,
})
