import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ACADEMY_SOURCE_REVISION,
  CHECKPOINT_FREEZE_DECLARATION,
  CLIENT_ASSERTION_SCENARIO_IDS,
  IDENTITY_SOURCE_REVISION,
  LIFECYCLE_SCENARIO_IDS,
  NOT_PROVEN_SCENARIO_IDS,
  PROFILE_ACTIVATION_SCENARIO_IDS,
  buildGeneratedArtifacts,
  renderCanonicalJson,
} from './generate-identity-control-conformance.mjs'

const consumerReceipt = {
  schema: 'identity-consumer-local-receipt/v2',
  mode: 'local-git-state',
  head: ACADEMY_SOURCE_REVISION,
  excludedPaths: [
    'reports/conformance/identity-control/academy-identity-control-conformance.json',
    CHECKPOINT_FREEZE_DECLARATION.path,
  ],
  indexStateSha256: '1'.repeat(64),
  indexEntryCount: 457,
  trackedWorktreeStateSha256: '2'.repeat(64),
  trackedWorktreeEntryCount: 457,
  untrackedStateSha256: '3'.repeat(64),
  untrackedEntryCount: 200,
  untrackedFileSha256: [],
}

const producerReceipt = {
  schema: 'identity-control-producer-local-receipt/v1',
  mode: 'local-git-artifact-state',
  head: IDENTITY_SOURCE_REVISION,
  scope: [],
  headStateSha256: '4'.repeat(64),
  headEntryCount: 6,
  indexStateSha256: '5'.repeat(64),
  indexEntryCount: 6,
  worktreeStateSha256: '6'.repeat(64),
  worktreeEntryCount: 6,
  artifactFileSha256: [],
}

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
  [
    'academy-web/tests/unit/identity-client-assertion-conformance.test.ts',
    '5b4371c87ff19595fe95ad38eed3379ce48fd50598c8c02a6ab7fe13cfcb1672',
  ],
  [
    'reports/reviews/academy-identity-client-assertion-provider-local-checkpoint-2026-08-11.md',
    '9518d4ededd4dae566140003700ee09b8d80024143aabd8c20528a2b65546547',
  ],
  [
    'reports/reviews/academy-identity-client-assertion-provider-freeze-20260811.json',
    '962ffd42dd848a1496237b0c55ba5021cffb78a8d3c3e35175985c61b341e27d',
  ],
  [
    'reports/reviews/academy-identity-client-assertion-jti-source-local-checkpoint-2026-08-11.md',
    'cc870a5c9ffb473c95822a6b389f6b8292080170f502b6a3a0bdca0ba07d99f6',
  ],
  [
    'reports/reviews/academy-identity-client-assertion-jti-source-freeze-20260811.json',
    'e44344fae1580429ea3fa5b666b0872919e3f448c5e3fc65b2aeb3b26a37b652',
  ],
  [
    'reports/reviews/academy-identity-client-assertion-webcrypto-signer-local-checkpoint-2026-08-11.md',
    '3b0870639b0244531df9aeeea096f6ab55749102f0aa939b88fc7a4d191f5a76',
  ],
  [
    'reports/reviews/academy-identity-client-assertion-webcrypto-signer-freeze-20260811.json',
    'b056eafdc00fa833dc2c2777235dbcc80c8b8f926e02f333c22f5d6d5a1f6ec7',
  ],
  [
    'reports/reviews/academy-identity-profile-activation-store-local-checkpoint-2026-08-11.md',
    'a56ff9a9e96b5aa09a6348136b1603cff84da42e3659ac60107dcf3ce19c258f',
  ],
  [
    'reports/reviews/academy-identity-profile-activation-store-freeze-20260811.json',
    '735bbb10654bfd7994c3b982c766341bbfda66e3def1f7dfab57b1a458159f45',
  ],
])

const expectedIdentityEvidenceDigests = new Map([
  [
    'packages/core/src/client-assertion.ts',
    '6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6',
  ],
  [
    'packages/core/test/client-assertion.test.ts',
    '58b67a100de26a7d8ffcbce20e4c021c9b84b3a0c9c4351c4c702121981d8d61',
  ],
])

function build() {
  return buildGeneratedArtifacts({
    localWorkingTreeReceipt: consumerReceipt,
    identityControlLocalArtifactReceipt: producerReceipt,
    observedEvidenceDigests: expectedEvidenceDigests,
    observedIdentityEvidenceDigests: expectedIdentityEvidenceDigests,
  })
}

describe('Academy Identity Control conformance generator', () => {
  test('declares the exact bytewise-sorted eight-file checkpoint content set', () => {
    assert.deepEqual(CHECKPOINT_FREEZE_DECLARATION, {
      schema: 'checkpoint-freeze-manifest.v1',
      role: 'identity-consumer-conformance-checkpoint',
      path: 'reports/reviews/academy-identity-control-profile-activation-conformance-freeze-20260811.json',
      contentPaths: [
        'academy-web/scripts/generate-identity-control-conformance.mjs',
        'academy-web/scripts/generate-identity-control-conformance.test.mjs',
        'plans/active_plan.md',
        'plans/completed_log.md',
        'reports/conformance/identity-control/academy-identity-control-conformance.json',
        'reports/conformance/identity-control/academy-identity-local-evidence.json',
        'reports/conformance/identity-control/academy-identity-unproven-scenarios.json',
        'reports/reviews/academy-identity-control-profile-activation-conformance-local-checkpoint-2026-08-11.md',
      ],
    })
  })

  test('promotes client assertion, lifecycle, and profile activation while retaining seven explicit gaps', () => {
    const { evidence, report, unproven } = build()
    const byId = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]))

    assert.equal(report.sourceRevision, ACADEMY_SOURCE_REVISION)
    assert.equal(report.identityControl.sourceRevision, IDENTITY_SOURCE_REVISION)
    assert.equal(report.registryState.enabled, false)
    assert.equal(report.scope.releaseApproval, false)
    assert.equal(report.scope.runtimeWired, false)
    assert.deepEqual(report.checkpointFreezeManifest, CHECKPOINT_FREEZE_DECLARATION)
    assert.deepEqual(report.summary, {
      trackedScenarioCount: 23,
      provenLocally: 16,
      notProven: 7,
      productionReady: false,
      noProductionMutation: true,
    })

    assert.deepEqual(
      evidence.scenarios.map(({ id }) => id),
      [...CLIENT_ASSERTION_SCENARIO_IDS, ...LIFECYCLE_SCENARIO_IDS, ...PROFILE_ACTIVATION_SCENARIO_IDS],
    )
    assert.deepEqual(Object.keys(unproven.scenarios), NOT_PROVEN_SCENARIO_IDS)
    assert.equal(report.scenarios.length, 23)
    assert.equal(report.scenarios.filter(({ result }) => result === 'pass').length, 16)
    assert.equal(report.scenarios.filter(({ result }) => result === 'not_proven').length, 7)

    assert.deepEqual(
      evidence.checkpoints.find(({ id }) => id === 'client-assertion-composition'),
      {
        id: 'client-assertion-composition',
        evidenceType: 'test',
        testSource: {
          path: 'academy-web/tests/unit/identity-client-assertion-conformance.test.ts',
          sha256: '5b4371c87ff19595fe95ad38eed3379ce48fd50598c8c02a6ab7fe13cfcb1672',
        },
        producerEvidence: [
          {
            repository: 'identity-control',
            path: 'packages/core/src/client-assertion.ts',
            sha256: '6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6',
          },
          {
            repository: 'identity-control',
            path: 'packages/core/test/client-assertion.test.ts',
            sha256: '58b67a100de26a7d8ffcbce20e4c021c9b84b3a0c9c4351c4c702121981d8d61',
          },
        ],
        scenarios: ['exchange.client-assertion'],
      },
    )

    for (const id of [...CLIENT_ASSERTION_SCENARIO_IDS, ...LIFECYCLE_SCENARIO_IDS, ...PROFILE_ACTIVATION_SCENARIO_IDS]) {
      assert.equal(byId.get(id)?.result, 'pass')
      assert.equal(
        byId.get(id)?.evidence.artifactPath,
        'reports/conformance/identity-control/academy-identity-local-evidence.json',
      )
      assert.notEqual(byId.get(id)?.evidence.supportsClaim, false)
    }
    for (const id of NOT_PROVEN_SCENARIO_IDS) {
      assert.equal(byId.get(id)?.result, 'not_proven')
      assert.equal(byId.get(id)?.evidence.supportsClaim, false)
    }
  })

  test('renders byte-identical artifacts for identical source-bound inputs', () => {
    const first = build()
    const second = build()

    assert.equal(renderCanonicalJson(first.evidence), renderCanonicalJson(second.evidence))
    assert.equal(renderCanonicalJson(first.unproven), renderCanonicalJson(second.unproven))
    assert.equal(renderCanonicalJson(first.report), renderCanonicalJson(second.report))
  })

  test('fails closed on drift in a previously accepted checkpoint artifact', () => {
    const drifted = new Map(expectedEvidenceDigests)
    drifted.set(
      'reports/reviews/academy-identity-lifecycle-pull-cycle-local-checkpoint-2026-08-10.md',
      '0'.repeat(64),
    )

    assert.throws(
      () => buildGeneratedArtifacts({
        localWorkingTreeReceipt: consumerReceipt,
        identityControlLocalArtifactReceipt: producerReceipt,
        observedEvidenceDigests: drifted,
      }),
      /source-bound evidence digest mismatch/,
    )
  })

  test('fails closed on drift in the producer verifier or replay evidence', () => {
    const drifted = new Map(expectedIdentityEvidenceDigests)
    drifted.set('packages/core/test/client-assertion.test.ts', '0'.repeat(64))

    assert.throws(
      () => buildGeneratedArtifacts({
        localWorkingTreeReceipt: consumerReceipt,
        identityControlLocalArtifactReceipt: producerReceipt,
        observedEvidenceDigests: expectedEvidenceDigests,
        observedIdentityEvidenceDigests: drifted,
      }),
      /source-bound Identity evidence digest mismatch/,
    )
  })

  test('does not turn checkpoint evidence into runtime or release authorization', () => {
    const { evidence, report, unproven } = build()
    const rendered = `${renderCanonicalJson(evidence)}${renderCanonicalJson(unproven)}${renderCanonicalJson(report)}`

    assert.equal(evidence.registryEnabled, false)
    assert.equal(evidence.releaseApproval, false)
    assert.equal(evidence.runtimeWired, false)
    assert.equal(report.registryState.enabled, false)
    assert.equal(report.scope.releaseApproval, false)
    assert.equal(report.scope.runtimeWired, false)
    assert.doesNotMatch(rendered, /"enabled": true/)
    assert.doesNotMatch(rendered, /"releaseApproval": true/)
    assert.doesNotMatch(rendered, /"runtimeWired": true/)
  })

  test('promotes the reviewed profile-only activation boundary without granting runtime authority', () => {
    const { evidence, report, unproven } = build()
    const scenario = report.scenarios.find(({ id }) => id === 'academy.activation-profile-only')
    const checkpoint = evidence.checkpoints.find(({ id }) => id === 'profile-activation-store')

    assert.equal(scenario?.result, 'pass')
    assert.notEqual(scenario?.evidence.supportsClaim, false)
    assert.deepEqual(report.summary, {
      trackedScenarioCount: 23,
      provenLocally: 16,
      notProven: 7,
      productionReady: false,
      noProductionMutation: true,
    })
    assert.equal(Object.hasOwn(unproven.scenarios, 'academy.activation-profile-only'), false)
    assert.deepEqual(checkpoint, {
      id: 'profile-activation-store',
      verdict: 'C0/H0/M0/L0',
      report: {
        path: 'reports/reviews/academy-identity-profile-activation-store-local-checkpoint-2026-08-11.md',
        sha256: 'a56ff9a9e96b5aa09a6348136b1603cff84da42e3659ac60107dcf3ce19c258f',
      },
      freezeManifest: {
        path: 'reports/reviews/academy-identity-profile-activation-store-freeze-20260811.json',
        sha256: '735bbb10654bfd7994c3b982c766341bbfda66e3def1f7dfab57b1a458159f45',
      },
      scenarios: ['academy.activation-profile-only'],
    })
    assert.equal(evidence.runtimeWired, false)
    assert.equal(evidence.releaseApproval, false)
  })
})
