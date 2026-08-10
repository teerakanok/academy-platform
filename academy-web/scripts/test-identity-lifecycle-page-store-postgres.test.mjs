import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  assertNoAmbientContainerAuthority,
  attemptOwnedContainerCreate,
  buildOwnedPostgresRunArguments,
  cleanupOwnedContainer,
  createDockerInvoker,
  installTerminationHandlers,
  inspectPinnedPostgresImage,
  verifyOwnedDisposablePostgresInspection,
} from './test-identity-lifecycle-page-store-postgres.mjs'

const pinnedImage = 'postgres@sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302'
const pinnedImageId = 'sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302'

const result = (status, stderr = '', stdout = '') => ({ status, stderr, stdout, error: undefined })
const absent = (name) => result(
  1,
  `Error response from daemon: {"message":"No such container: ${name}"}\n`,
)
const present = (name, labels = {}) => result(0, '', JSON.stringify([{
  Name: `/${name}`,
  Config: { Labels: labels },
}]))

const nonce = '00000000-0000-4000-8000-000000000001'
const ownedEvidence = {
  nonce,
  containerName: 'academy-identity-lifecycle-1234-00000000',
  containerId: 'a'.repeat(64),
  imageId: `sha256:${'b'.repeat(64)}`,
  databaseUrl: 'postgresql://academy_identity_lifecycle_test:ephemeral@127.0.0.1:61001/academy_identity_lifecycle_test',
}

const ownedInspection = (overrides = {}) => result(0, '', JSON.stringify([{
  Id: ownedEvidence.containerId,
  Name: `/${ownedEvidence.containerName}`,
  Image: ownedEvidence.imageId,
  State: { Running: true },
  Config: {
    Image: pinnedImageId,
    Labels: {
      'com.cyberskills.test': 'academy-identity-lifecycle-page-store',
      'com.cyberskills.test-run': nonce,
    },
  },
  NetworkSettings: {
    Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '61001' }] },
  },
  ...overrides,
}]))

describe('disposable PostgreSQL Docker authority', () => {
  test('accepts only the pinned immutable local image metadata and records its architecture', () => {
    const calls = []
    const metadata = inspectPinnedPostgresImage((args) => {
      calls.push(args)
      return result(0, '', `${JSON.stringify(pinnedImageId)}\t${JSON.stringify([pinnedImage])}\t${JSON.stringify('arm64')}\n`)
    })

    assert.deepEqual(calls, [[
      'image', 'inspect', '--format',
      '{{json .Id}}\t{{json .RepoDigests}}\t{{json .Architecture}}',
      pinnedImageId,
    ]])
    assert.deepEqual(metadata, {
      imageId: pinnedImageId,
      repoDigest: pinnedImage,
      architecture: 'arm64',
    })
  })

  test('fails closed when the immutable image is absent or metadata does not match', () => {
    const invalid = [
      result(1, 'Error response from daemon: No such image'),
      result(0, '', `${JSON.stringify(`sha256:${'c'.repeat(64)}`)}\t${JSON.stringify([pinnedImage])}\t${JSON.stringify('arm64')}\n`),
      result(0, '', `${JSON.stringify(pinnedImageId)}\t${JSON.stringify(['postgres@sha256:' + 'd'.repeat(64)])}\t${JSON.stringify('arm64')}\n`),
      result(0, '', `${JSON.stringify(pinnedImageId)}\t${JSON.stringify([pinnedImage])}\t${JSON.stringify('')}\n`),
      result(0, '', `${JSON.stringify(pinnedImageId)}\t${JSON.stringify([pinnedImage])}\t${JSON.stringify('amd64')}\n`),
    ]

    for (const response of invalid) {
      assert.throws(() => inspectPinnedPostgresImage(() => response), /image|metadata/)
    }
  })

  test('creates only from the verified content-addressed ID with registry pulls disabled', () => {
    const args = buildOwnedPostgresRunArguments({
      containerName: ownedEvidence.containerName,
      ownerNonce: nonce,
      port: 61001,
    })

    assert.deepEqual(args.slice(0, 5), ['run', '--detach', '--rm', '--pull', 'never'])
    assert.equal(args.at(-1), pinnedImageId)
    assert.equal(args.includes(pinnedImage), false)
    assert.equal(args.includes('postgres:17.5'), false)
    assert.equal(args.filter((value) => value === '--pull').length, 1)
  })

  test('rejects every ambient Docker, TLS, context, config, and Compose authority', () => {
    for (const name of [
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_CONFIG',
      'DOCKER_TLS',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      'DOCKER_API_VERSION',
      'COMPOSE_FILE',
      'COMPOSE_PROJECT_NAME',
      'COMPOSE_PROFILES',
      'TEST_DATABASE_URL',
      'DATABASE_URL',
      'PGHOST',
      'PGPORT',
      'PGDATABASE',
      'PGUSER',
      'PGPASSWORD',
      'ACADEMY_IDENTITY_LIFECYCLE_DISPOSABLE',
      'ACADEMY_IDENTITY_LIFECYCLE_TEST_DATABASE_URL',
      'ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_ID',
      'ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_NAME',
      'ACADEMY_IDENTITY_LIFECYCLE_IMAGE_ID',
    ]) {
      assert.throws(
        () => assertNoAmbientContainerAuthority({ [name]: 'attacker-controlled' }),
        new RegExp(name),
      )
    }
  })

  test('pins the validated CLI and local Unix socket with a private config and minimal env', () => {
    const calls = []
    const invoke = createDockerInvoker({
      cliPath: '/trusted/docker',
      socketPath: '/trusted/docker.sock',
      configDirectory: '/private/empty-config',
      spawn: (command, args, options) => {
        calls.push({ command, args, options })
        return result(0)
      },
    })

    invoke(['image', 'inspect', 'postgres:17.5'], {
      env: { POSTGRES_PASSWORD: 'ephemeral' },
      timeoutMs: 3210,
    })

    assert.deepEqual(calls, [{
      command: '/trusted/docker',
      args: [
        '--host', 'unix:///trusted/docker.sock',
        '--config', '/private/empty-config',
        'image', 'inspect', 'postgres:17.5',
      ],
      options: {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3210,
        env: {
          LANG: 'C',
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
          POSTGRES_PASSWORD: 'ephemeral',
        },
      },
    }])
  })

  test('treats a failed or timed-out create as ambiguous until exact absence is proved', () => {
    const name = 'owned-create-ambiguity'
    const calls = []
    const invoke = (args) => {
      calls.push(args)
      if (args[0] === 'run') return { ...result(null), error: { code: 'ETIMEDOUT' } }
      if (args[0] === 'rm') return result(1, 'remove returned after timeout')
      return absent(name)
    }

    assert.equal(attemptOwnedContainerCreate(invoke, name, ['run', '--name', name]), false)
    assert.deepEqual(calls.map((args) => args[0]), ['run', 'container'])
  })

  test('fails after bounded removal retries while the owned container still exists', () => {
    const calls = []
    const invoke = (args) => {
      calls.push(args)
      return args[0] === 'rm'
        ? result(1, 'permission denied')
        : present('owned-remove-failure')
    }

    assert.throws(() => cleanupOwnedContainer(invoke, 'owned-remove-failure', 3), /cleanup/)
    assert.equal(calls.filter((args) => args[0] === 'rm').length, 3)
    assert.equal(calls.filter((args) => args[0] === 'container').length, 6)
  })

  test('does not classify daemon or inspect uncertainty as container absence', () => {
    const calls = []
    const invoke = (args) => {
      calls.push(args)
      return args[0] === 'rm'
        ? result(0)
        : result(1, 'Cannot connect to the Docker daemon at unix:///trusted/docker.sock')
    }

    assert.throws(() => cleanupOwnedContainer(invoke, 'owned-inspect-uncertain', 3), /uncertain/)
    assert.equal(calls.filter((args) => args[0] === 'container').length, 1)
  })

  test('runs cleanup and final absence proof before SIGINT or SIGTERM exit', () => {
    for (const [signal, expectedCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
      const handlers = new Map()
      const order = []
      installTerminationHandlers({
        once: (name, handler) => handlers.set(name, handler),
      }, () => order.push('cleanup'), (code) => order.push(`exit:${code}`))

      handlers.get(signal)()
      assert.deepEqual(order, ['cleanup', `exit:${expectedCode}`])
    }
  })

  test('uses failure exit when signal cleanup cannot prove absence', () => {
    const handlers = new Map()
    const exits = []
    installTerminationHandlers({
      once: (name, handler) => handlers.set(name, handler),
    }, () => {
      throw new Error('absence uncertain')
    }, (code) => exits.push(code))

    handlers.get('SIGTERM')()
    assert.deepEqual(exits, [1])
  })

  test('accepts only an exact running harness-owned PostgreSQL inspection', () => {
    const calls = []
    const invoke = (args) => {
      calls.push(args)
      return ownedInspection()
    }

    assert.equal(
      verifyOwnedDisposablePostgresInspection(invoke, ownedEvidence),
      ownedEvidence.databaseUrl,
    )
    assert.deepEqual(calls, [['container', 'inspect', ownedEvidence.containerName]])
  })

  test('rejects uncertain, absent, stopped, or mismatched owned-container evidence', () => {
    const invalidInspections = [
      result(1, 'Cannot connect to the Docker daemon'),
      absent(ownedEvidence.containerName),
      ownedInspection({ Id: 'c'.repeat(64) }),
      ownedInspection({ Name: '/different-container' }),
      ownedInspection({ Image: `sha256:${'c'.repeat(64)}` }),
      ownedInspection({ State: { Running: false } }),
      ownedInspection({ Config: { Image: `sha256:${'c'.repeat(64)}`, Labels: {
        'com.cyberskills.test': 'academy-identity-lifecycle-page-store',
        'com.cyberskills.test-run': nonce,
      } } }),
      ownedInspection({ Config: { Image: pinnedImageId, Labels: {
        'com.cyberskills.test': 'academy-identity-lifecycle-page-store',
        'com.cyberskills.test-run': '00000000-0000-4000-8000-000000000002',
      } } }),
      ownedInspection({ NetworkSettings: {
        Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '61002' }] },
      } }),
      ownedInspection({ NetworkSettings: {
        Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '61001' }] },
      } }),
    ]

    for (const inspection of invalidInspections) {
      assert.throws(
        () => verifyOwnedDisposablePostgresInspection(() => inspection, ownedEvidence),
        /authority|inspection/,
      )
    }
  })

  test('rejects forged or malformed disposable environment evidence before inspect', () => {
    const invalidEvidence = [
      { ...ownedEvidence, nonce: 'forged' },
      { ...ownedEvidence, containerName: 'academy-identity-lifecycle-forged' },
      { ...ownedEvidence, containerId: 'A'.repeat(64) },
      { ...ownedEvidence, imageId: `sha256:${'B'.repeat(64)}` },
      { ...ownedEvidence, databaseUrl: ownedEvidence.databaseUrl.replace('127.0.0.1', 'localhost') },
      { ...ownedEvidence, databaseUrl: ownedEvidence.databaseUrl.replace('61001', '62000') },
      { ...ownedEvidence, databaseUrl: `${ownedEvidence.databaseUrl}?sslmode=require` },
    ]

    for (const evidence of invalidEvidence) {
      let inspected = false
      assert.throws(() => verifyOwnedDisposablePostgresInspection(() => {
        inspected = true
        return ownedInspection()
      }, evidence), /authority|evidence/)
      assert.equal(inspected, false)
    }
  })
})
