import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import {
  AcademyIdentityLifecyclePageStore,
  buildIdentityLifecyclePageCommit,
  type IdentityLifecyclePageCommit,
  type IdentityLifecycleRpcClient,
} from '@/lib/identity/lifecycle-page-store'
import {
  IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS,
  IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS,
} from '@/lib/identity/lifecycle-pull-lease'

const migrationPaths = [
  join(process.cwd(), 'supabase/migrations/0022_identity_lifecycle_projection.sql'),
  join(process.cwd(), 'supabase/migrations/0023_identity_lifecycle_pull_lease.sql'),
  join(process.cwd(), 'supabase/migrations/0026_identity_lifecycle_principal_contract.sql'),
]
const principalMigrationPath = migrationPaths[2]!
const PRODUCER_ACCEPTED_ISSUERS = [
  'https://accounts.example.test/',
  'https://accounts.example.test/auth/v1',
  'https://accounts.example.test/auth/v1/',
  'https://supabase.cyberskills.co.th/auth/v1',
] as const
const PRODUCER_REJECTED_ISSUERS = [
  'https://ACCOUNTS.example.test/auth/v1',
  'https://accounts.example.test:443/auth/v1',
  'https://accounts.example.test/a/../auth/v1',
  'https://accounts.example.test/auth/v1?tenant=one',
  'https://accounts.example.test/auth/v1#fragment',
  'https://user@accounts.example.test/auth/v1',
  'https://accounts.example.test',
  'https://accounts.example.test/auth%2Fv1',
  'https://accounts.example.test//auth/v1',
  'https://a.1/',
  'https://127.1/',
  'https://0x7f.1/',
  'https://0177.0.0.1/',
  'https://127.000.000.001/',
  'https://xn--a.example/',
  'https://xn--abc.example/',
  'https://xn--bcher-kva.example/',
  'https://identity-control.example.test/',
  'https://accounts.example.test/\n',
  'https://accounts.example.test/\r',
] as const
let admin: Client
let databaseUrl: string

class PostgreSqlRpcClient implements IdentityLifecycleRpcClient {
  readonly statements: string[] = []

  constructor(private readonly client: Client) {}

  async rpc(functionName: string, parameters: Record<string, unknown>) {
    try {
      if (functionName === 'read_identity_lifecycle_snapshot') {
        const statement = 'select academy.read_identity_lifecycle_snapshot() as data'
        this.statements.push(statement)
        const result = await this.client.query(statement)
        return { data: result.rows[0]?.data ?? null, error: null }
      }
      if (functionName === 'claim_identity_lifecycle_pull_lease') {
        const statement = `select academy.claim_identity_lifecycle_pull_lease(
          $1::text, $2::numeric
        ) as data`
        this.statements.push(statement)
        const result = await this.client.query(statement, [
          parameters.p_claimed_by,
          parameters.p_lease_duration_ms,
        ])
        return { data: result.rows[0]?.data ?? null, error: null }
      }
      if (functionName === 'renew_identity_lifecycle_pull_lease') {
        const statement = `select academy.renew_identity_lifecycle_pull_lease(
          $1::text, $2::text, $3::numeric
        ) as data`
        this.statements.push(statement)
        const result = await this.client.query(statement, [
          parameters.p_claim_token,
          parameters.p_claimed_by,
          parameters.p_lease_duration_ms,
        ])
        return { data: result.rows[0]?.data ?? null, error: null }
      }
      if (functionName === 'release_identity_lifecycle_pull_lease') {
        const statement = `select academy.release_identity_lifecycle_pull_lease(
          $1::text, $2::text
        ) as data`
        this.statements.push(statement)
        const result = await this.client.query(statement, [
          parameters.p_claim_token,
          parameters.p_claimed_by,
        ])
        return { data: result.rows[0]?.data ?? null, error: null }
      }
      if (functionName !== 'commit_identity_lifecycle_page_under_lease') {
        return { data: null, error: { message: 'unknown RPC' } }
      }
      const statement = `select academy.commit_identity_lifecycle_page_under_lease(
        $1::text, $2::text, $3::text, $4::text, $5::bigint, $6::text,
        $7::bigint, $8::jsonb
      ) as data`
      this.statements.push(statement)
      const commitParameters = [
        parameters.p_expected_cursor,
        parameters.p_next_cursor,
        parameters.p_approved_config_revision,
        parameters.p_configuration_health,
        parameters.p_observed_config_revision,
        JSON.stringify(parameters.p_projections),
      ]
      const result = await this.client.query(statement, [
        parameters.p_claim_token,
        parameters.p_claimed_by,
        ...commitParameters,
      ])
      return { data: result.rows[0]?.data ?? null, error: null }
    } catch {
      return { data: null, error: { message: 'database statement failed' } }
    }
  }
}

async function verifiedDisposableDatabaseUrl(): Promise<string> {
  const moduleUrl = new URL(
    '../../scripts/test-identity-lifecycle-page-store-postgres.mjs',
    import.meta.url,
  ).href
  const harness = await import(/* @vite-ignore */ moduleUrl) as {
    verifyOwnedDisposablePostgresEnvironment(environment: NodeJS.ProcessEnv): string
  }
  return harness.verifyOwnedDisposablePostgresEnvironment(process.env)
}

function lifecycleEvent(subject: string, state: 'active' | 'disabled' | 'deleted', revision: number) {
  return {
    eventId: `00000000-0000-4000-8000-${revision.toString().padStart(12, '0')}`,
    kind: 'account.lifecycle.changed' as const,
    issuer: 'https://accounts.example.test/auth/v1',
    subject,
    state,
    revision,
    occurredAt: `2026-08-09T04:${revision.toString().padStart(2, '0')}:00.000Z`,
    reason: `account_${state}` as const,
  }
}

function seedCommit(nextCursor = '1'): IdentityLifecyclePageCommit {
  return buildIdentityLifecyclePageCommit(null, {
    nextCursor,
    configRevision: 1,
    events: [lifecycleEvent('learner-a', 'active', 1)],
  }, 1)
}

async function rawCommit(
  client: Client,
  commit: IdentityLifecyclePageCommit,
  projections: unknown = wireProjections(commit.projections),
) {
  const configuration = commit.configuration
  return client.query(
    `select academy.commit_identity_lifecycle_page(
      $1::text, $2::text, $3::bigint, $4::text, $5::bigint, $6::jsonb
    )`,
    [
      commit.expectedCursor,
      commit.nextCursor,
      configuration.approvedRevision,
      configuration.health.status,
      configuration.health.status === 'config_revision_changed'
        ? configuration.health.observedRevision
        : null,
      JSON.stringify(projections),
    ],
  )
}

function fixtureSubjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

function wireProjections(projections: IdentityLifecyclePageCommit['projections']) {
  return projections.map((projection) => ({
    current: {
      issuer: projection.current.issuer,
      subjectKey: fixtureSubjectKey(projection.current.subject),
      state: projection.current.state,
      revision: projection.current.revision,
    },
    health: projection.health.status === 'gap'
      ? {
          status: 'gap',
          observed: {
            issuer: projection.health.observed.issuer,
            subjectKey: fixtureSubjectKey(projection.health.observed.subject),
            state: projection.health.observed.state,
            revision: projection.health.observed.revision,
          },
        }
      : structuredClone(projection.health),
    highestKnownRevision: projection.highestKnownRevision,
  }))
}

beforeAll(async () => {
  databaseUrl = await verifiedDisposableDatabaseUrl()
  admin = new Client({ connectionString: databaseUrl })
  await admin.connect()
  const identity = await admin.query(`select
    current_database() as database,
    current_user as username`)
  expect(identity.rows[0]).toMatchObject({
    database: 'academy_identity_lifecycle_test',
    username: 'academy_identity_lifecycle_test',
  })
  await admin.query(`create schema if not exists academy`)
  await admin.query(`do $block$
    begin
      if not exists (select 1 from pg_roles where rolname = 'academy_runtime') then
        create role academy_runtime nologin;
      end if;
    end
  $block$`)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const migrationPath of migrationPaths) {
      await admin.query(await readFile(migrationPath, 'utf8'))
    }
  }
})

afterEach(async () => {
  await admin.query(`drop trigger if exists fail_second_projection
    on academy.identity_lifecycle_projection`)
  await admin.query(`drop function if exists academy.fail_second_identity_projection()`)
  await admin.query(`drop trigger if exists pause_identity_projection
    on academy.identity_lifecycle_projection`)
  await admin.query(`drop function if exists academy.pause_identity_projection()`)
  await admin.query(`truncate table academy.identity_lifecycle_projection,
    academy.identity_lifecycle_consumer_checkpoint,
    academy.identity_lifecycle_pull_leases`)
})

afterAll(async () => {
  await admin?.end()
})

describe('Academy Identity lifecycle atomic PostgreSQL page store', () => {
  it('reapplies both migrations and exposes only the fenced runtime capabilities', async () => {
    const objects = await admin.query(`select table_name from information_schema.tables
      where table_schema = 'academy' and table_name like 'identity_lifecycle_%'
      order by table_name`)
    expect(objects.rows).toEqual([
      { table_name: 'identity_lifecycle_consumer_checkpoint' },
      { table_name: 'identity_lifecycle_projection' },
      { table_name: 'identity_lifecycle_pull_leases' },
    ])
    const foreignKeys = await admin.query(`select count(*)::int as count
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'academy' and c.contype = 'f'
        and c.conrelid in (
          'academy.identity_lifecycle_consumer_checkpoint'::regclass,
          'academy.identity_lifecycle_projection'::regclass,
          'academy.identity_lifecycle_pull_leases'::regclass
        )`)
    expect(foreignKeys.rows[0]?.count).toBe(0)

    const privileges = await admin.query(`select
      has_function_privilege('academy_runtime',
        'academy.commit_identity_lifecycle_page(text,text,bigint,text,bigint,jsonb)', 'execute') as commit_runtime,
      has_function_privilege('academy_runtime',
        'academy.commit_identity_lifecycle_page_under_lease(text,text,text,text,bigint,text,bigint,jsonb)', 'execute') as leased_commit_runtime,
      has_function_privilege('academy_runtime',
        'academy.claim_identity_lifecycle_pull_lease(text,numeric)', 'execute') as claim_runtime,
      has_function_privilege('academy_runtime',
        'academy.renew_identity_lifecycle_pull_lease(text,text,numeric)', 'execute') as renew_runtime,
      has_function_privilege('academy_runtime',
        'academy.release_identity_lifecycle_pull_lease(text,text)', 'execute') as release_runtime,
      has_function_privilege('academy_runtime',
        'academy.read_identity_lifecycle_snapshot()', 'execute') as read_runtime,
      has_function_privilege('public',
        'academy.commit_identity_lifecycle_page(text,text,bigint,text,bigint,jsonb)', 'execute') as commit_public,
      has_function_privilege('public',
        'academy.read_identity_lifecycle_snapshot()', 'execute') as read_public,
      has_function_privilege('public',
        'academy.claim_identity_lifecycle_pull_lease(text,numeric)', 'execute') as claim_public,
      has_function_privilege('public',
        'academy.commit_identity_lifecycle_page_under_lease(text,text,text,text,bigint,text,bigint,jsonb)', 'execute') as leased_commit_public,
      has_function_privilege('academy_runtime',
        'academy.identity_lifecycle_issuer_is_canonical(text)', 'execute') as issuer_helper_runtime,
      has_function_privilege('academy_runtime',
        'academy.identity_lifecycle_subject_key_is_valid(text)', 'execute') as subject_helper_runtime`)
    expect(privileges.rows[0]).toEqual({
      commit_runtime: false,
      leased_commit_runtime: true,
      claim_runtime: true,
      renew_runtime: true,
      release_runtime: true,
      read_runtime: true,
      commit_public: false,
      read_public: false,
      claim_public: false,
      leased_commit_public: false,
      issuer_helper_runtime: false,
      subject_helper_runtime: false,
    })
    const tablePrivileges = await admin.query(`select
      has_table_privilege('academy_runtime',
        'academy.identity_lifecycle_pull_leases', 'select,insert,update,delete') as runtime_direct,
      has_table_privilege('public',
        'academy.identity_lifecycle_pull_leases', 'select,insert,update,delete') as public_direct`)
    expect(tablePrivileges.rows[0]).toEqual({ runtime_direct: false, public_direct: false })

    await admin.query('set role academy_runtime')
    await expect(admin.query(`insert into academy.identity_lifecycle_consumer_checkpoint
      (consumer_id, approved_config_revision, configuration_health)
      values ('academy-web', 1, 'ready')`)).rejects.toThrow(/permission denied/)
    await expect(admin.query(`insert into academy.identity_lifecycle_pull_leases
      (consumer_id, claim_token, claimed_by, lease_until, updated_at)
      values ('academy-web', '00000000-0000-4000-8000-000000000001', 'worker-a',
        transaction_timestamp() + interval '1 minute', transaction_timestamp())`))
      .rejects.toThrow(/permission denied/)
    await admin.query('reset role')

    await expect(admin.query(`insert into academy.identity_lifecycle_consumer_checkpoint
      (consumer_id, approved_config_revision, configuration_health, observed_config_revision)
      values ('academy-web', 1, 'config_revision_changed', null)`)).rejects.toThrow()
    await expect(admin.query(`insert into academy.identity_lifecycle_projection (
      consumer_id, issuer, subject_key, state, revision, health, highest_known_revision
    ) values (
      'academy-web', 'https://accounts.example.test/auth/v1', '0061',
      'active', 1, 'gap', 2
    )`)).rejects.toThrow()
  })

  it('uses the database clock for one claim winner and fences a reclaimed token', async () => {
    const clients = [
      new Client({ connectionString: databaseUrl }),
      new Client({ connectionString: databaseUrl }),
    ]
    await Promise.all(clients.map((client) => client.connect()))
    try {
      const stores = clients.map((client) => new AcademyIdentityLifecyclePageStore(
        new PostgreSqlRpcClient(client),
      ))
      const claims = await Promise.all(stores.map((store, index) => store.claimPullLease({
        workerId: `worker-${index}`,
        leaseDurationMs: IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS,
      })))
      expect(claims.filter(Boolean)).toHaveLength(1)
      const winner = claims.findIndex(Boolean)
      const first = claims[winner]!
      const active = await admin.query(`select
        lease_until > transaction_timestamp() as active,
        lease_until <= transaction_timestamp() + interval '1 second' as bounded
        from academy.identity_lifecycle_pull_leases where consumer_id = 'academy-web'`)
      expect(active.rows[0]).toEqual({ active: true, bounded: true })

      await admin.query('select pg_sleep(1.1)')
      const replacementStore = stores[winner === 0 ? 1 : 0]!
      const replacement = await replacementStore.claimPullLease({
        workerId: 'replacement-worker', leaseDurationMs: 60_000,
      })
      expect(replacement?.claimToken).not.toBe(first.claimToken)
      await expect(stores[winner]!.renewPullLease({
        claimToken: first.claimToken,
        claimedBy: first.claimedBy,
        leaseDurationMs: 60_000,
      })).resolves.toBeNull()
      await expect(stores[winner]!.releasePullLease({
        claimToken: first.claimToken, claimedBy: first.claimedBy,
      })).resolves.toBe(false)
      await expect(stores[winner]!.commitPageUnderLease(seedCommit(), {
        claimToken: first.claimToken, claimedBy: first.claimedBy,
      })).rejects.toThrow(/under lease failed/)
      expect(await stores[winner]!.read()).toBeNull()

      await replacementStore.commitPageUnderLease(seedCommit(), {
        claimToken: replacement!.claimToken, claimedBy: replacement!.claimedBy,
      })
      expect(await replacementStore.read()).toMatchObject({ cursor: '1' })
    } finally {
      await Promise.all(clients.map((client) => client.end()))
    }
  })

  it('enforces exact durable lease duration and identity inputs', async () => {
    const store = new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(admin))
    for (const leaseDurationMs of [
      IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS,
      IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS,
    ]) {
      const lease = await store.claimPullLease({ workerId: 'boundary-worker', leaseDurationMs })
      expect(lease).not.toBeNull()
      await expect(store.releasePullLease({
        claimToken: lease!.claimToken, claimedBy: lease!.claimedBy,
      })).resolves.toBe(true)
    }

    for (const invalidDuration of [999, 300_001, 1_000.5]) {
      await expect(admin.query(`select academy.claim_identity_lifecycle_pull_lease(
        $1::text, $2::numeric
      )`, ['worker-a', invalidDuration])).rejects.toThrow(/duration/)
    }
    for (const invalidWorker of ['-worker', 'worker-a\n', 'worker-a\r\n', 'worker-a\u2028']) {
      await expect(admin.query(`select academy.claim_identity_lifecycle_pull_lease(
        $1::text, $2::numeric
      )`, [invalidWorker, 1_000])).rejects.toThrow(/worker/)
    }
    await expect(admin.query(`select academy.release_identity_lifecycle_pull_lease(
      $1::text, $2::text
    )`, ['00000000-0000-1000-8000-000000000001', 'worker-a']))
      .rejects.toThrow(/token/)
    await expect(admin.query(`select academy.release_identity_lifecycle_pull_lease(
      $1::text, $2::text
    )`, ['00000000-0000-4000-8000-000000000001\n', 'worker-a']))
      .rejects.toThrow(/token/)
  })

  it('holds the active lease row lock through the aggregate commit transaction', async () => {
    const blocker = new Client({ connectionString: databaseUrl })
    const writer = new Client({ connectionString: databaseUrl })
    const competitor = new Client({ connectionString: databaseUrl })
    await Promise.all([blocker.connect(), writer.connect(), competitor.connect()])
    try {
      const store = new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(writer))
      const competingStore = new AcademyIdentityLifecyclePageStore(
        new PostgreSqlRpcClient(competitor),
      )
      const lease = await store.claimPullLease({ workerId: 'worker-a', leaseDurationMs: 60_000 })
      await admin.query(`create function academy.pause_identity_projection()
        returns trigger language plpgsql as $body$
        begin
          perform pg_advisory_xact_lock(700023);
          return new;
        end
      $body$`)
      await admin.query(`create trigger pause_identity_projection before insert
        on academy.identity_lifecycle_projection for each row
        execute function academy.pause_identity_projection()`)
      await blocker.query('select pg_advisory_lock(700023)')

      const commit = store.commitPageUnderLease(seedCommit(), {
        claimToken: lease!.claimToken, claimedBy: lease!.claimedBy,
      })
      let writerBlocked = false
      for (let attempt = 0; attempt < 100 && !writerBlocked; attempt += 1) {
        const locks = await admin.query(`select count(*)::int as count from pg_locks
          where locktype = 'advisory' and objid = 700023 and not granted`)
        writerBlocked = locks.rows[0]?.count === 1
        if (!writerBlocked) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(writerBlocked).toBe(true)

      let competitorFinished = false
      const competingClaim = competingStore.claimPullLease({
        workerId: 'worker-b', leaseDurationMs: 60_000,
      }).then((result) => {
        competitorFinished = true
        return result
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(competitorFinished).toBe(false)

      await blocker.query('select pg_advisory_unlock(700023)')
      await expect(commit).resolves.toBeUndefined()
      await expect(competingClaim).resolves.toBeNull()
      expect(await store.read()).toMatchObject({ cursor: '1' })
    } finally {
      await blocker.query('select pg_advisory_unlock_all()').catch(() => undefined)
      await Promise.all([blocker.end(), writer.end(), competitor.end()])
    }
  })

  it('rolls back a fenced page failure and permits bounded recovery', async () => {
    const store = new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(admin))
    const lease = await store.claimPullLease({ workerId: 'worker-a', leaseDurationMs: 60_000 })
    await admin.query(`create function academy.fail_second_identity_projection()
      returns trigger language plpgsql as $body$
      begin
        if new.subject_key = '${fixtureSubjectKey('learner-b')}'
          then raise exception 'injected second write failure'; end if;
        return new;
      end
    $body$`)
    await admin.query(`create trigger fail_second_projection before insert
      on academy.identity_lifecycle_projection for each row
      execute function academy.fail_second_identity_projection()`)
    const commit = buildIdentityLifecyclePageCommit(null, {
      nextCursor: '2', configRevision: 2,
      events: [lifecycleEvent('learner-a', 'active', 1), lifecycleEvent('learner-b', 'active', 1)],
    }, 1)

    await expect(store.commitPageUnderLease(commit, {
      claimToken: lease!.claimToken, claimedBy: lease!.claimedBy,
    })).rejects.toThrow(/under lease failed/)
    expect((await admin.query(`select count(*)::int as count
      from academy.identity_lifecycle_projection`)).rows[0]?.count).toBe(0)
    expect((await admin.query(`select count(*)::int as count
      from academy.identity_lifecycle_consumer_checkpoint`)).rows[0]?.count).toBe(0)
    await expect(store.releasePullLease({
      claimToken: lease!.claimToken, claimedBy: lease!.claimedBy,
    })).resolves.toBe(true)

    await admin.query(`drop trigger fail_second_projection
      on academy.identity_lifecycle_projection`)
    await admin.query(`drop function academy.fail_second_identity_projection()`)
    const recovered = await store.claimPullLease({
      workerId: 'worker-b', leaseDurationMs: 60_000,
    })
    await store.commitPageUnderLease(seedCommit(), {
      claimToken: recovered!.claimToken, claimedBy: recovered!.claimedBy,
    })
    expect(await store.read()).toMatchObject({ cursor: '1' })
  })

  it('atomically seeds an empty page and snapshots through one statement', async () => {
    const client = new PostgreSqlRpcClient(admin)
    const store = new AcademyIdentityLifecyclePageStore(client)
    await rawCommit(admin, buildIdentityLifecyclePageCommit(null, {
      nextCursor: null, configRevision: 1, events: [],
    }, 1))
    expect(await store.read()).toEqual({
      cursor: null,
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [],
    })
    expect(client.statements).toHaveLength(1)
    expect(client.statements.filter((statement) => statement.includes('read_identity'))).toHaveLength(1)
  })

  it('commits two principals without user linkage and one ordered final update', async () => {
    const client = new PostgreSqlRpcClient(admin)
    const store = new AcademyIdentityLifecyclePageStore(client)
    await rawCommit(admin, buildIdentityLifecyclePageCommit(null, {
      nextCursor: '3',
      configRevision: 1,
      events: [
        lifecycleEvent('learner-a', 'active', 1),
        lifecycleEvent('learner-b', 'active', 1),
        lifecycleEvent('learner-a', 'disabled', 2),
      ],
    }, 1))
    const snapshot = await store.read()
    expect(snapshot?.cursor).toBe('3')
    expect(snapshot?.projections).toHaveLength(2)
    expect(snapshot?.projections[0]?.current).toMatchObject({ subject: 'learner-a', revision: 2 })
    expect(snapshot?.projections[1]?.current).toMatchObject({ subject: 'learner-b', revision: 1 })
  })

  it('persists gap and config mismatch fences while advancing the cursor', async () => {
    const store = new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(admin))
    await rawCommit(admin, seedCommit())
    const current = await store.read()
    await rawCommit(admin, buildIdentityLifecyclePageCommit(current, {
      nextCursor: '2',
      configRevision: 2,
      events: [lifecycleEvent('learner-a', 'disabled', 3)],
    }, 1))
    expect(await store.read()).toMatchObject({
      cursor: '2',
      configuration: {
        approvedRevision: 1,
        health: { status: 'config_revision_changed', observedRevision: 2 },
      },
      projections: [{
        current: { subject: 'learner-a', state: 'active', revision: 1 },
        health: { status: 'gap', observed: { state: 'disabled', revision: 3 } },
        highestKnownRevision: 3,
      }],
    })
  })

  it('does not let the page RPC clear a durable lifecycle or configuration fence', async () => {
    const store = new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(admin))
    await rawCommit(admin, seedCommit())
    await rawCommit(admin, buildIdentityLifecyclePageCommit(await store.read(), {
      nextCursor: '2',
      configRevision: 1,
      events: [lifecycleEvent('learner-a', 'disabled', 3)],
    }, 1))
    const gapSnapshot = await store.read()

    await expect(rawCommit(admin, {
      expectedCursor: '2',
      nextCursor: '3',
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [{
        current: {
          issuer: 'https://accounts.example.test/auth/v1',
          subject: 'learner-a',
          state: 'active',
          revision: 3,
        },
        health: { status: 'ready' },
        highestKnownRevision: 3,
      }],
    })).rejects.toThrow(/fence requires reconciliation/)
    expect(await store.read()).toEqual(gapSnapshot)

    await rawCommit(admin, buildIdentityLifecyclePageCommit(gapSnapshot, {
      nextCursor: '3', configRevision: 2, events: [],
    }, 1))
    const configSnapshot = await store.read()
    await expect(rawCommit(admin, {
      expectedCursor: '3',
      nextCursor: '4',
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [],
    })).rejects.toThrow(/configuration fence/)
    expect(await store.read()).toEqual(configSnapshot)
  })

  it('preserves exact gap evidence across raw-RPC gap and conflict transitions', async () => {
    const store = new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(admin))
    await rawCommit(admin, seedCommit())
    await rawCommit(admin, buildIdentityLifecyclePageCommit(await store.read(), {
      nextCursor: '2',
      configRevision: 1,
      events: [lifecycleEvent('learner-a', 'disabled', 3)],
    }, 1))

    await rawCommit(admin, {
      expectedCursor: '2',
      nextCursor: '3',
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [{
        current: {
          issuer: 'https://accounts.example.test/auth/v1',
          subject: 'learner-a',
          state: 'active',
          revision: 1,
        },
        health: {
          status: 'gap',
          observed: {
            issuer: 'https://accounts.example.test/auth/v1',
            subject: 'learner-a',
            state: 'deleted',
            revision: 4,
          },
        },
        highestKnownRevision: 4,
      }],
    })
    expect(await store.read()).toMatchObject({
      cursor: '3',
      projections: [{
        current: { state: 'active', revision: 1 },
        health: { status: 'gap', observed: { state: 'disabled', revision: 3 } },
        highestKnownRevision: 4,
      }],
    })

    await rawCommit(admin, {
      expectedCursor: '3',
      nextCursor: '4',
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [{
        current: {
          issuer: 'https://accounts.example.test/auth/v1',
          subject: 'learner-a',
          state: 'active',
          revision: 1,
        },
        health: { status: 'conflict', reason: 'event_conflict' },
        highestKnownRevision: 4,
      }],
    })
    await rawCommit(admin, {
      expectedCursor: '4',
      nextCursor: '5',
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [{
        current: {
          issuer: 'https://accounts.example.test/auth/v1',
          subject: 'learner-a',
          state: 'active',
          revision: 1,
        },
        health: { status: 'conflict', reason: 'unresolved_conflict' },
        highestKnownRevision: 5,
      }],
    })
    expect(await store.read()).toMatchObject({
      cursor: '5',
      projections: [{
        current: { state: 'active', revision: 1 },
        health: { status: 'conflict', reason: 'unresolved_conflict' },
        highestKnownRevision: 5,
      }],
    })

    await expect(rawCommit(admin, {
      expectedCursor: '5',
      nextCursor: '6',
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [{
        current: {
          issuer: 'https://accounts.example.test/auth/v1',
          subject: 'learner-a',
          state: 'active',
          revision: 1,
        },
        health: {
          status: 'gap',
          observed: {
            issuer: 'https://accounts.example.test/auth/v1',
            subject: 'learner-a',
            state: 'disabled',
            revision: 3,
          },
        },
        highestKnownRevision: 5,
      }],
    })).rejects.toThrow(/fence requires reconciliation/)
    expect((await store.read())?.cursor).toBe('5')
  })

  it('enforces canonical issuer and canonical UTF-16 subject keys in SQL', async () => {
    for (const issuer of PRODUCER_ACCEPTED_ISSUERS) {
      const result = await admin.query(`select
        academy.identity_lifecycle_issuer_is_canonical($1::text) as accepted`, [issuer])
      expect(result.rows[0]?.accepted).toBe(true)
    }
    for (const issuer of PRODUCER_REJECTED_ISSUERS) {
      const result = await admin.query(`select
        academy.identity_lifecycle_issuer_is_canonical($1::text) as accepted`, [issuer])
      expect(result.rows[0]?.accepted).toBe(false)
    }

    for (const [subjectKey, accepted] of [
      ['0061', true],
      ['0e01'.repeat(512), true],
      ['d83dde00'.repeat(256), true],
      ['d800', false],
      ['dc00', false],
      ['d8000061', false],
      ['0061dc00', false],
    ] as const) {
      const result = await admin.query(`select
        academy.identity_lifecycle_subject_key_is_valid($1::text) as accepted`, [subjectKey])
      expect(result.rows[0]?.accepted).toBe(accepted)
    }

    const invalidIssuer = seedCommit()
    invalidIssuer.projections[0]!.current.issuer = 'https://ACCOUNTS.example.test/auth/v1'
    await expect(rawCommit(admin, invalidIssuer)).rejects.toThrow(/projection values|principal/)

    const exactBoundary = seedCommit()
    exactBoundary.projections[0]!.current.subject = '😀'.repeat(256)
    await expect(rawCommit(admin, exactBoundary)).resolves.toBeDefined()
    expect((await new AcademyIdentityLifecyclePageStore(
      new PostgreSqlRpcClient(admin),
    ).read())?.projections[0]?.current.subject).toBe('😀'.repeat(256))

    await admin.query(`truncate table academy.identity_lifecycle_projection,
      academy.identity_lifecycle_consumer_checkpoint`)
    const overBoundary = seedCommit()
    overBoundary.projections[0]!.current.subject = '😀'.repeat(257)
    await expect(rawCommit(admin, overBoundary)).rejects.toThrow(/projection values|principal/)
  })

  it('aborts the forward migration when a legacy principal violates the producer contract', async () => {
    const migration = await readFile(principalMigrationPath, 'utf8')
    await admin.query(`create or replace function academy.identity_lifecycle_subject_key_is_valid(
      p_value text
    ) returns boolean language sql immutable security invoker set search_path = pg_catalog
    as $function$ select true $function$`)
    await admin.query(`insert into academy.identity_lifecycle_projection (
      consumer_id, issuer, subject_key, state, revision, health, highest_known_revision
    ) values (
      'academy-web', 'https://accounts.example.test/auth/v1', 'd800',
      'active', 1, 'ready', 1
    )`)

    await expect(admin.query(migration)).rejects.toThrow(/violate the producer contract/)
    expect((await admin.query(`select subject_key from academy.identity_lifecycle_projection`))
      .rows).toEqual([{ subject_key: 'd800' }])

    await admin.query(`delete from academy.identity_lifecycle_projection`)
    await admin.query(migration)
    expect((await admin.query(`select
      academy.identity_lifecycle_subject_key_is_valid('d800') as accepted`))
      .rows[0]?.accepted).toBe(false)
  })

  it('rejects lone UTF-16 surrogate keys and round-trips a valid pair', async () => {
    for (const subjectKey of ['d800', 'dc00']) {
      const commit = seedCommit()
      const projections = wireProjections(commit.projections)
      projections[0]!.current.subjectKey = subjectKey
      await expect(rawCommit(admin, commit, projections)).rejects.toThrow(/subject key|projection/)
      expect((await admin.query(`select count(*)::int as count
        from academy.identity_lifecycle_consumer_checkpoint`)).rows[0]?.count).toBe(0)
    }

    const subjects = ['\ud800\udc00']
    const store = new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(admin))
    await rawCommit(admin, buildIdentityLifecyclePageCommit(null, {
      nextCursor: '1',
      configRevision: 1,
      events: subjects.map((subject) => lifecycleEvent(subject, 'active', 1)),
    }, 1))

    expect((await store.read())?.projections.map((projection) => projection.current.subject))
      .toEqual(['\ud800\udc00'])
    expect((await admin.query(`select subject_key from academy.identity_lifecycle_projection
      order by subject_key collate "C"`)).rows).toEqual([
      { subject_key: 'd800dc00' },
    ])
  })

  it.each([
    ['empty', ''],
    ['uppercase', 'D800'],
    ['NUL code unit', '0000'],
    ['partial group', 'd80'],
    ['non-hex', 'gggg'],
    ['overbound', '0061'.repeat(513)],
  ])('rejects a raw-RPC noncanonical subject key: %s', async (_label, subjectKey) => {
    const commit = seedCommit()
    const projections = wireProjections(commit.projections)
    projections[0]!.current.subjectKey = subjectKey
    await expect(rawCommit(admin, commit, projections)).rejects.toThrow(/subject key|projection/)
    expect((await admin.query(`select count(*)::int as count
      from academy.identity_lifecycle_consumer_checkpoint`)).rows[0]?.count).toBe(0)
  })

  it('rejects retry/CAS conflict and lets exactly one concurrent writer win', async () => {
    const initial = seedCommit()
    await rawCommit(admin, initial)
    await expect(rawCommit(admin, initial)).rejects.toThrow(/cursor conflict/)
    expect((await new AcademyIdentityLifecyclePageStore(new PostgreSqlRpcClient(admin)).read())?.cursor)
      .toBe('1')

    await admin.query(`truncate table academy.identity_lifecycle_projection,
      academy.identity_lifecycle_consumer_checkpoint`)
    const left = new Client({ connectionString: databaseUrl })
    const right = new Client({ connectionString: databaseUrl })
    await Promise.all([left.connect(), right.connect()])
    try {
      const outcomes = await Promise.allSettled([
        rawCommit(left, seedCommit('1')),
        rawCommit(right, seedCommit('2')),
      ])
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)
      const cursor = await admin.query(`select cursor_sequence
        from academy.identity_lifecycle_consumer_checkpoint`)
      expect(['1', '2']).toContain(cursor.rows[0]?.cursor_sequence)
      expect((await admin.query(`select count(*)::int as count
        from academy.identity_lifecycle_projection`)).rows[0]?.count).toBe(1)
    } finally {
      await Promise.all([left.end(), right.end()])
    }
  })

  it('rolls back a cursor, config latch, and first principal after a later write fails', async () => {
    await admin.query(`create function academy.fail_second_identity_projection()
      returns trigger language plpgsql as $body$
      begin
        if new.subject_key = '${fixtureSubjectKey('learner-b')}'
          then raise exception 'injected second write failure'; end if;
        return new;
      end
    $body$`)
    await admin.query(`create trigger fail_second_projection before insert
      on academy.identity_lifecycle_projection for each row
      execute function academy.fail_second_identity_projection()`)
    const commit = buildIdentityLifecyclePageCommit(null, {
      nextCursor: '2', configRevision: 2,
      events: [lifecycleEvent('learner-a', 'active', 1), lifecycleEvent('learner-b', 'active', 1)],
    }, 1)

    await expect(rawCommit(admin, commit)).rejects.toThrow(/injected second write failure/)
    expect((await admin.query(`select count(*)::int as count
      from academy.identity_lifecycle_projection`)).rows[0]?.count).toBe(0)
    expect((await admin.query(`select count(*)::int as count
      from academy.identity_lifecycle_consumer_checkpoint`)).rows[0]?.count).toBe(0)
  })

  it.each([
    ['non-canonical cursor', ['01', '1', 1, 'ready', null, []]],
    ['cursor beyond bigint', [null, '9223372036854775808', 1, 'ready', null, []]],
    ['config mismatch self-approval shape', [null, '1', 1, 'config_revision_changed', 1, []]],
    ['missing config observation', [null, '1', 1, 'config_revision_changed', null, []]],
    ['SQL-null projections', [null, '1', 1, 'ready', null, undefined]],
    ['extra projection key', [null, '1', 1, 'ready', null, [{
      current: { issuer: 'https://accounts.example.test/auth/v1', subjectKey: '0061', state: 'active', revision: 1 },
      health: { status: 'ready' }, highestKnownRevision: 1, extra: true,
    }]]],
    ['unsafe revision', [null, '1', 1, 'ready', null, [{
      current: {
        issuer: 'https://accounts.example.test/auth/v1', subjectKey: '0061', state: 'active',
        revision: 9_007_199_254_740_992,
      },
      health: { status: 'ready' }, highestKnownRevision: 9_007_199_254_740_992,
    }]]],
  ])('rejects bounded SQL input: %s', async (_label, values) => {
    await expect(admin.query(`select academy.commit_identity_lifecycle_page(
      $1::text, $2::text, $3::bigint, $4::text, $5::bigint, $6::jsonb
    )`, [values[0], values[1], values[2], values[3], values[4], JSON.stringify(values[5])]))
      .rejects.toThrow()
    expect((await admin.query(`select count(*)::int as count
      from academy.identity_lifecycle_consumer_checkpoint`)).rows[0]?.count).toBe(0)
  })
})
