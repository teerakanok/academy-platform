import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'

const ISSUER = 'https://supabase.cyberskills.co.th/auth/v1'

let admin: Client
let databaseUrl: string

type WireProjection = {
  current: {
    issuer: string
    subjectKey: string
    state: 'active' | 'disabled' | 'deleted'
    revision: number
  }
  health: { status: 'ready' } | {
    status: 'gap'
    observed: {
      issuer: string
      subjectKey: string
      state: 'active' | 'disabled' | 'deleted'
      revision: number
    }
  }
  highestKnownRevision: number
}

function subjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

function readyProjection(
  subject: string,
  state: WireProjection['current']['state'],
  revision: number,
): WireProjection {
  return {
    current: {
      issuer: ISSUER,
      subjectKey: subjectKey(subject),
      state,
      revision,
    },
    health: { status: 'ready' },
    highestKnownRevision: revision,
  }
}

async function commitUnderLease(
  expectedCursor: string | null,
  nextCursor: string,
  projections: WireProjection[],
  configuration: { health: 'ready' | 'config_revision_changed', observedRevision?: number } = {
    health: 'ready',
  },
  client = admin,
): Promise<void> {
  const claim = await client.query(`select
    academy.claim_identity_lifecycle_pull_lease('enforcement-worker', 60000) as claim`)
  const token = claim.rows[0].claim as { claimToken: string, claimedBy: string }
  expect(token).toMatchObject({ claimedBy: 'enforcement-worker' })
  await client.query(`select academy.commit_identity_lifecycle_page_under_lease(
    $1, $2, $3, $4, $5::bigint, $6, $7::bigint, $8::jsonb
  )`, [
    token.claimToken,
    token.claimedBy,
    expectedCursor,
    nextCursor,
    1,
    configuration.health,
    configuration.observedRevision ?? null,
    JSON.stringify(projections),
  ])
}

async function activate(
  subject: string,
  email: string,
  revision = 1,
): Promise<string> {
  await admin.query(`insert into academy.identity_lifecycle_consumer_checkpoint (
    consumer_id, cursor_sequence, approved_config_revision, configuration_health,
    observed_config_revision
  ) values ('academy-web', null, 1, 'ready', null)
  on conflict (consumer_id) do nothing`)
  await admin.query(`insert into academy.identity_lifecycle_projection (
    consumer_id, issuer, subject_key, state, revision, health,
    highest_known_revision, observed_state, observed_revision, conflict_reason
  ) values ('academy-web', $1, $2, 'active', 1, 'ready', 1, null, null, null)
  on conflict (consumer_id, issuer, subject_key) do nothing`, [ISSUER, subjectKey(subject)])
  const result = await admin.query(`select academy.commit_identity_profile_activation(
    $1, $2, $3, 'active', $4
  ) as account_id`, [ISSUER, subject, email, revision])
  return result.rows[0].account_id
}

async function createSession(
  sessionId: string,
  subject: string,
  email: string,
  revision = 1,
  client = admin,
): Promise<void> {
  await client.query(`select academy.create_identity_session(
    $1, $2, $3, $4, 'active', $5, 86400
  )`, [sessionId, ISSUER, subjectKey(subject), email, revision])
}

async function countSessions(subject: string): Promise<number> {
  const result = await admin.query(
    'select count(*)::int as count from academy.identity_session where issuer = $1 and subject_key = $2',
    [ISSUER, subjectKey(subject)],
  )
  return result.rows[0].count
}

async function activation(
  accountId: string,
): Promise<{ status: string, revision: number }> {
  const result = await admin.query(
    'select status, revision from academy.service_activation where user_id = $1',
    [accountId],
  )
  return result.rows[0]
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

beforeAll(async () => {
  databaseUrl = await verifiedDisposableDatabaseUrl()
  admin = new Client({ connectionString: databaseUrl })
  await admin.connect()
  const roles = ['postgres', 'anon', 'authenticated', 'service_role']
    .map((role) => `do $fixture$ begin
      if not exists (select 1 from pg_roles where rolname = '${role}') then
        create role ${role} nologin noinherit;
      end if;
    end $fixture$;`).join('\n')
  const migrationDirectory = join(process.cwd(), 'supabase/migrations')
  const bootstrapPaths = [
    'supabase/privileged/academy-data-api-roles.sql',
    'supabase/privileged/academy-retention-api-roles.sql',
    ...readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql'))
      .sort().map((name) => `supabase/migrations/${name}`),
  ]
  const bootstrap = roles + '\n' + bootstrapPaths.map((file) =>
    readFileSync(join(process.cwd(), file), 'utf8')
      .replace(/^\s*(?:begin|commit);\s*$/gmi, ''),
  ).join('\n') + '\nalter schema academy owner to postgres;'
  // Production migrations run with the postgres schema owner. The disposable
  // harness uses its own login; mirror schema ownership for the postgres-owned
  // certificate/settings FK triggers without widening academy_runtime privileges.
  await admin.query('BEGIN;\n' + bootstrap + '\nROLLBACK;')
  await admin.query('BEGIN;\n' + bootstrap + '\nCOMMIT;')
})

afterEach(async () => {
  await admin.query('delete from academy.course_entitlement_audit')
  await admin.query(`truncate table academy.identity_session,
    academy.identity_authorization_transaction,
    academy.identity_lifecycle_authorization_fences,
    academy.identity_lifecycle_projection,
    academy.identity_lifecycle_consumer_checkpoint,
    academy.identity_lifecycle_pull_leases, academy.users cascade`)
})

afterAll(async () => {
  await admin?.end()
})

describe('Academy Identity lifecycle runtime enforcement', () => {
  it('suspends a signed disabled projection and revokes only that principal sessions', async () => {
    const accountId = await activate('disabled-subject', 'disabled@example.com')
    const unrelatedId = await activate('unrelated-subject', 'unrelated@example.com')
    await createSession('A'.repeat(43), 'disabled-subject', 'disabled@example.com')
    await createSession('B'.repeat(43), 'disabled-subject', 'disabled@example.com')
    await createSession('C'.repeat(43), 'unrelated-subject', 'unrelated@example.com')

    await commitUnderLease(null, '1', [readyProjection('disabled-subject', 'disabled', 2)])

    expect(await activation(accountId)).toEqual({ status: 'suspended', revision: 2 })
    expect(await countSessions('disabled-subject')).toBe(0)
    expect(await activation(unrelatedId)).toEqual({ status: 'active', revision: 1 })
    expect(await countSessions('unrelated-subject')).toBe(1)
  })

  it('erases the profile, keeps detached audit authority, and refuses stale callback resurrection', async () => {
    const accountId = await activate('erased-subject', 'erased@example.com')
    await admin.query(`insert into academy.course_entitlement_audit (
      account_id, course_slug, action, source, actor_account_id, authorization_reference
    ) values ($1, 'cas-005', 'granted', 'grant', $1, 'lifecycle-audit-001')`, [accountId])
    await createSession('D'.repeat(43), 'erased-subject', 'erased@example.com')

    await commitUnderLease(null, '1', [readyProjection('erased-subject', 'deleted', 2)])

    const profile = await admin.query(
      'select count(*)::int as count from academy.users where id = $1',
      [accountId],
    )
    const audit = await admin.query(
      'select count(*)::int as count from academy.course_entitlement_audit where account_id = $1',
      [accountId],
    )
    expect(profile.rows[0].count).toBe(0)
    expect(audit.rows[0].count).toBe(1)
    expect(await countSessions('erased-subject')).toBe(0)
    await expect(activate('erased-subject', 'erased@example.com'))
      .rejects.toThrow(/canonical Identity principal is not active/)
    const resurrected = await admin.query(
      'select count(*)::int as count from academy.users where issuer = $1 and subject = $2',
      [ISSUER, 'erased-subject'],
    )
    expect(resurrected.rows[0].count).toBe(0)
  })

  it('keeps a gap fail-closed without revoking on an out-of-order projection', async () => {
    const accountId = await activate('gap-subject', 'gap@example.com')
    await createSession('E'.repeat(43), 'gap-subject', 'gap@example.com')

    await commitUnderLease(null, '1', [{
      current: {
        issuer: ISSUER,
        subjectKey: subjectKey('gap-subject'),
        state: 'active',
        revision: 1,
      },
      health: {
        status: 'gap',
        observed: {
          issuer: ISSUER,
          subjectKey: subjectKey('gap-subject'),
          state: 'disabled',
          revision: 3,
        },
      },
      highestKnownRevision: 3,
    }])

    expect(await activation(accountId)).toEqual({ status: 'active', revision: 1 })
    expect(await countSessions('gap-subject')).toBe(1)
  })

  it('refuses stale callback email and preserves the newer verified email', async () => {
    await activate('email-subject', 'old@example.com')
    await expect(activate('email-subject', 'new@example.com'))
      .rejects.toThrow(/stale verified email/)
    await expect(activate('email-subject', 'new@example.com', 2)).resolves.toBeDefined()
    await expect(activate('email-subject', 'old@example.com', 1))
      .rejects.toThrow(/stale identity profile activation input/)
    const profile = await admin.query(
      'select email from academy.users where issuer = $1 and subject = $2',
      [ISSUER, 'email-subject'],
    )
    expect(profile.rows[0].email).toBe('new@example.com')
  })

  it('lets the effective runtime activate profiles while denying direct authorization writes', async () => {
    const runtime = new Client({ connectionString: databaseUrl })
    await runtime.connect()
    try {
      await commitUnderLease(null, '1', [
        readyProjection('runtime-effective-subject', 'active', 1),
        readyProjection('runtime-canonical-subject', 'active', 1),
      ])
      await runtime.query('set role academy_runtime')

      await expect(runtime.query(`
        select academy.commit_identity_profile_activation(
          $1, $2, $3, 'active', 1
        ) as account_id
      `, [ISSUER, 'runtime-unobserved-subject', 'runtime-unobserved@example.com']))
        .rejects.toThrow(/canonical Identity principal is not active/)
      await runtime.query('rollback')

      const activated = await runtime.query(`
        select academy.commit_identity_profile_activation(
          $1, $2, $3, 'active', 1
        ) as account_id
      `, [ISSUER, 'runtime-effective-subject', 'runtime-effective@example.com'])
      const accountId = activated.rows[0].account_id as string

      await expect(runtime.query(`
        select academy.commit_identity_profile_activation(
          $1, $2, $3, 'suspended', 1
        ) as account_id
      `, [ISSUER, 'runtime-effective-subject', 'runtime-effective@example.com']))
        .rejects.toThrow(/activation revision conflict/)
      await runtime.query('rollback')

      const promoted = await runtime.query(`
        select academy.commit_identity_profile_activation(
          $1, $2, $3, 'suspended', 2
        ) as account_id
      `, [ISSUER, 'runtime-effective-subject', 'runtime-effective@example.com'])
      expect(promoted.rows[0].account_id).toBe(accountId)
      expect(await activation(accountId)).toEqual({ status: 'suspended', revision: 2 })

      const canonical = await runtime.query(`
        select academy.commit_identity_profile_activation(
          $1, $2, $3, 'active', 1
        ) as account_id
      `, [ISSUER, 'runtime-canonical-subject', 'runtime-effective@example.com'])
      expect(canonical.rows[0].account_id).not.toBe(accountId)
      const mapped = await admin.query(`
        select subject, email from academy.users
        where issuer = $1 and subject = any($2)
        order by subject
      `, [ISSUER, ['runtime-canonical-subject', 'runtime-effective-subject']])
      expect(mapped.rows).toEqual([
        { subject: 'runtime-canonical-subject', email: 'runtime-effective@example.com' },
        { subject: 'runtime-effective-subject', email: 'runtime-effective@example.com' },
      ])

      await expect(runtime.query(`
        insert into academy.service_activation (user_id, status, revision)
        values ($1, 'suspended', 2)
      `, [accountId])).rejects.toThrow(/permission denied for table service_activation/i)
      await runtime.query('rollback')

      const boundary = await runtime.query(`
        select
          has_table_privilege(current_user, 'academy.service_activation', 'insert') as activation_insert,
          has_table_privilege(current_user, 'academy.service_activation', 'update') as activation_update,
          has_table_privilege(current_user, 'academy.course_entitlement', 'insert') as entitlement_insert,
          has_table_privilege(current_user, 'academy.course_entitlement', 'update') as entitlement_update,
          has_function_privilege(current_user, 'academy.sync_service_activation(uuid,text,integer)', 'execute') as sync_execute
      `)
      expect(boundary.rows[0]).toEqual({
        activation_insert: false,
        activation_update: false,
        entitlement_insert: false,
        entitlement_update: false,
        sync_execute: true,
      })

      const definition = await admin.query(`
        select
          owner.rolname as owner,
          function_definition.prosecdef as security_definer,
          array_to_string(function_definition.proconfig, ',') as configuration
        from pg_proc function_definition
        join pg_roles owner on owner.oid = function_definition.proowner
        where function_definition.oid =
          'academy.sync_service_activation(uuid,text,integer)'::regprocedure
      `)
      expect(definition.rows[0]).toEqual({
        owner: 'academy_activation_writer',
        security_definer: true,
        configuration: 'search_path=pg_catalog, academy',
      })

      const writerBoundary = await admin.query(`
        select
          has_table_privilege('academy_activation_writer', 'academy.service_activation', 'select') as activation_select,
          has_table_privilege('academy_activation_writer', 'academy.service_activation', 'insert') as activation_insert,
          has_table_privilege('academy_activation_writer', 'academy.service_activation', 'update') as activation_update,
          has_table_privilege('academy_activation_writer', 'academy.service_activation', 'delete') as activation_delete,
          has_table_privilege('academy_activation_writer', 'academy.course_entitlement', 'insert') as entitlement_insert,
          has_table_privilege('academy_activation_writer', 'academy.staff_role_assignment', 'insert') as staff_insert
      `)
      expect(writerBoundary.rows[0]).toEqual({
        activation_select: true,
        activation_insert: true,
        activation_update: true,
        activation_delete: false,
        entitlement_insert: false,
        staff_insert: false,
      })

      const sharedRoles = await admin.query(`
        select
          has_function_privilege('service_role', 'academy.sync_service_activation(uuid,text,integer)', 'execute') as service_execute,
          has_function_privilege('academy_entitlement_operator', 'academy.sync_service_activation(uuid,text,integer)', 'execute') as operator_execute,
          has_function_privilege('academy_staff_admin', 'academy.sync_service_activation(uuid,text,integer)', 'execute') as staff_execute
      `)
      expect(sharedRoles.rows[0]).toEqual({
        service_execute: false,
        operator_execute: false,
        staff_execute: false,
      })
    } finally {
      await runtime.query('reset role').catch(() => undefined)
      await runtime.end()
    }
  })

  it('pauses active grants on an unapproved config revision while applying revocations', async () => {
    const pausedId = await activate('config-active-subject', 'active@example.com')
    const revokedId = await activate('config-disabled-subject', 'disabled@example.com')
    await createSession('F'.repeat(43), 'config-active-subject', 'active@example.com')
    await createSession('G'.repeat(43), 'config-disabled-subject', 'disabled@example.com')

    await commitUnderLease(null, '2', [
      readyProjection('config-active-subject', 'active', 2),
      readyProjection('config-disabled-subject', 'disabled', 2),
    ], { health: 'config_revision_changed', observedRevision: 2 })

    expect(await activation(pausedId)).toEqual({ status: 'active', revision: 1 })
    expect(await countSessions('config-active-subject')).toBe(1)
    expect(await activation(revokedId)).toEqual({ status: 'suspended', revision: 2 })
    expect(await countSessions('config-disabled-subject')).toBe(0)
  })

  it('denies callback activation while the durable config revision is unapproved', async () => {
    await commitUnderLease(null, '1', [
      readyProjection('config-callback-subject', 'active', 1),
    ], { health: 'config_revision_changed', observedRevision: 2 })

    await expect(activate('config-callback-subject', 'callback@example.com'))
      .rejects.toThrow(/canonical Identity principal is not active/)
    const profile = await admin.query(
      'select count(*)::int as count from academy.users where issuer = $1 and subject = $2',
      [ISSUER, 'config-callback-subject'],
    )
    expect(profile.rows[0].count).toBe(0)
  })

  it('reconciles a previously observed revision only through the source-approved API', async () => {
    const accountId = await activate('config-recovery-subject', 'recovery@example.com')
    await createSession('I'.repeat(43), 'config-recovery-subject', 'recovery@example.com')
    await commitUnderLease(null, '1', [
      readyProjection('config-recovery-subject', 'active', 2),
    ], { health: 'config_revision_changed', observedRevision: 2 })

    await expect(admin.query(
      'select academy.approve_identity_lifecycle_config_revision(3) as approved',
    )).rejects.toThrow()
    const approval = await admin.query(
      'select academy.approve_identity_lifecycle_config_revision(2) as approved',
    )
    expect(approval.rows[0].approved).toBe(true)
    expect(await activation(accountId)).toEqual({ status: 'active', revision: 2 })
    expect(await countSessions('config-recovery-subject')).toBe(0)
    const checkpoint = await admin.query(`select approved_config_revision, configuration_health,
      observed_config_revision from academy.identity_lifecycle_consumer_checkpoint
      where consumer_id = 'academy-web'`)
    expect(checkpoint.rows[0]).toEqual({
      approved_config_revision: '2',
      configuration_health: 'ready',
      observed_config_revision: null,
    })
    const privileges = await admin.query(`select
      has_function_privilege('academy_runtime',
        'academy.approve_identity_lifecycle_config_revision(bigint)', 'EXECUTE') as runtime,
      has_function_privilege('service_role',
        'academy.approve_identity_lifecycle_config_revision(bigint)', 'EXECUTE') as service,
      has_function_privilege('anon',
        'academy.approve_identity_lifecycle_config_revision(bigint)', 'EXECUTE') as anon`)
    expect(privileges.rows[0]).toEqual({ runtime: true, service: false, anon: false })
  })

  it('serializes session issuance behind a deletion commit and rechecks the principal', async () => {
    await activate('racing-subject', 'racing@example.com')
    const lifecycle = new Client({ connectionString: databaseUrl })
    const callback = new Client({ connectionString: databaseUrl })
    await lifecycle.connect()
    await callback.connect()
    try {
      await lifecycle.query('begin')
      await commitUnderLease(null, '1', [
        readyProjection('racing-subject', 'deleted', 2),
      ], { health: 'ready' }, lifecycle)

      const callbackPid = await callback.query('select pg_backend_pid() as pid')
      const attemptedSession = createSession(
        'H'.repeat(43),
        'racing-subject',
        'racing@example.com',
        1,
        callback,
      ).then(
        () => ({ outcome: 'created' as const }),
        (error: unknown) => ({ outcome: 'rejected' as const, error }),
      )
      let advisoryWaitObserved = false
      for (let attempt = 0; attempt < 50 && !advisoryWaitObserved; attempt += 1) {
        const activity = await admin.query(
          'select wait_event_type, wait_event from pg_stat_activity where pid = $1',
          [callbackPid.rows[0].pid],
        )
        advisoryWaitObserved = activity.rows[0]?.wait_event_type === 'Lock'
          && activity.rows[0]?.wait_event === 'advisory'
        if (!advisoryWaitObserved) {
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
      }
      await lifecycle.query('commit')
      const result = await attemptedSession

      expect(advisoryWaitObserved).toBe(true)
      expect(result.outcome).toBe('rejected')
      if (result.outcome === 'rejected') {
        expect(result.error).toMatchObject({ code: '23514' })
      }
      expect(await countSessions('racing-subject')).toBe(0)
    } finally {
      await lifecycle.query('rollback').catch(() => undefined)
      await Promise.all([lifecycle.end(), callback.end()])
    }
  })

  it('blocks the unsafe rollback before changing lifecycle enforcement', async () => {
    const rollback = readFileSync(
      join(process.cwd(), 'supabase/rollbacks/0032_identity_lifecycle_runtime_enforcement.rollback.sql'),
      'utf8',
    )
    await expect(admin.query(rollback)).rejects.toMatchObject({ code: '55000' })
    const retained = await admin.query(`select
      to_regprocedure('academy.identity_lifecycle_allows_profile_activation(text,text)') is not null
        as activation_guard,
      to_regprocedure('academy.guard_identity_session_insert()') is not null as session_guard,
      to_regclass('academy.identity_session_principal_idx') is not null as principal_index`)
    expect(retained.rows[0]).toEqual({
      activation_guard: true,
      session_guard: true,
      principal_index: true,
    })
  })

  it('takes the principal advisory lock before expired-session cleanup', async () => {
    await activate('lock-order-subject', 'lock-order@example.com')
    await createSession('J'.repeat(43), 'lock-order-subject', 'lock-order@example.com')
    await admin.query(`update academy.identity_session
      set created_at = clock_timestamp() - interval '2 days',
          expires_at = clock_timestamp() - interval '1 day'
      where id = academy.identity_session_id_digest($1)`, ['J'.repeat(43)])

    const lifecycle = new Client({ connectionString: databaseUrl })
    const callback = new Client({ connectionString: databaseUrl })
    await lifecycle.connect()
    await callback.connect()
    try {
      await lifecycle.query('begin')
      await lifecycle.query(`select pg_advisory_xact_lock(
        hashtextextended(jsonb_build_array($1::text, $2::text)::text, 0)
      )`, [ISSUER, subjectKey('lock-order-subject')])
      const callbackPid = await callback.query('select pg_backend_pid() as pid')
      const attemptedSession = createSession(
        'K'.repeat(43), 'lock-order-subject', 'lock-order@example.com', 1, callback,
      ).then(
        () => ({ outcome: 'created' as const }),
        (error: unknown) => ({ outcome: 'rejected' as const, error }),
      )

      let advisoryWaitObserved = false
      for (let attempt = 0; attempt < 50 && !advisoryWaitObserved; attempt += 1) {
        const activity = await admin.query(
          'select wait_event_type, wait_event from pg_stat_activity where pid = $1',
          [callbackPid.rows[0].pid],
        )
        advisoryWaitObserved = activity.rows[0]?.wait_event_type === 'Lock'
          && activity.rows[0]?.wait_event === 'advisory'
        if (!advisoryWaitObserved) await new Promise((resolve) => setTimeout(resolve, 20))
      }

      await lifecycle.query("set local lock_timeout = '250ms'")
      let revoked: number | Error
      try {
        const result = await lifecycle.query(
          'select academy.revoke_identity_sessions_for_principal($1, $2, 1000) as count',
          [ISSUER, subjectKey('lock-order-subject')],
        )
        revoked = result.rows[0].count
        await lifecycle.query('commit')
      } catch (error) {
        revoked = error as Error
        await lifecycle.query('rollback')
      }
      const sessionResult = await attemptedSession

      expect(advisoryWaitObserved).toBe(true)
      expect(revoked).toBe(1)
      expect(sessionResult.outcome).toBe('created')
      expect(await countSessions('lock-order-subject')).toBe(1)
    } finally {
      await lifecycle.query('rollback').catch(() => undefined)
      await Promise.all([lifecycle.end(), callback.end()])
    }
  })
})


describe('Academy v2 assurance and authoritative session lifetime', () => {
  const bearer = 'V'.repeat(43)
  const digest = createHash('sha256').update(bearer).digest('base64url')
  const subject = 'assurance-session-fixture'
  const email = 'assurance-session@example.test'
  async function createV2(client = admin, authTime?: number) {
    if (authTime === undefined) {
      const clock = await admin.query('select floor(extract(epoch from clock_timestamp()))::bigint as now')
      authTime = Number(clock.rows[0].now)
    }
    const result = await client.query(`select academy.create_identity_session_digest_v2(
      $1,$2,$3,$4,'active',1,43200,$5::bigint) as result`,
    [digest, ISSUER, subjectKey(subject), email, authTime])
    return result.rows[0].result
  }
  async function read(client = admin) {
    return (await client.query('select academy.read_identity_session_digest($1) as result', [digest])).rows[0].result
  }
  it('persists exact verified seconds and limits a v2 session to twelve hours', async () => {
    await activate(subject, email)
    const now = Number((await admin.query('select floor(extract(epoch from clock_timestamp()))::bigint as now')).rows[0].now)
    const created = await createV2(admin, now - 300)
    expect(created.session.claims.authentication).toEqual({ method: 'webauthn_uv', auth_time: now - 300 })
    expect(Date.parse(created.session.claims.expiresAt) - Date.parse(created.session.claims.createdAt)).toBe(43_200_000)
    expect((await read()).session.claims.authentication).toEqual(created.session.claims.authentication)
  })
  it('rejects stale authentication atomically without leaving a usable inserted session', async () => {
    await activate(subject, email)
    await expect(createV2(admin, 1)).rejects.toThrow(/fresh identity authentication/)
    expect(await countSessions(subject)).toBe(0)
  })
  it('returns explicit legacy unknown without inventing historical authentication', async () => {
    await activate(subject, email)
    await createSession(bearer, subject, email)
    expect((await read()).session.claims.authentication).toEqual({ method: 'legacy_unknown' })
  })
  it.each(['idle', 'absolute'] as const)('never resurrects an expired %s session', async (kind) => {
    await activate(subject, email)
    await createV2()
    if (kind === 'idle') {
      await admin.query(`update academy.identity_session set created_at = clock_timestamp() - interval '31 minutes',
        last_seen_at = clock_timestamp() - interval '30 minutes' where id = $1`, [digest])
    } else {
      await admin.query(`update academy.identity_session set created_at = clock_timestamp() - interval '12 hours',
        last_seen_at = clock_timestamp() where id = $1`, [digest])
    }
    expect(await read()).toEqual({ status: 'expired' })
    expect(await read()).toEqual({ status: 'unknown' })
  })
  it('touches active activity while preserving the absolute ceiling and authentication', async () => {
    await activate(subject, email)
    await createV2()
    await admin.query(`update academy.identity_session set created_at = clock_timestamp() - interval '20 minutes',
      last_seen_at = clock_timestamp() - interval '10 minutes' where id = $1`, [digest])
    const before = (await admin.query('select expires_at, authentication_time, last_seen_at from academy.identity_session where id=$1', [digest])).rows[0]
    expect((await read()).status).toBe('active')
    const after = (await admin.query('select expires_at, authentication_time, last_seen_at from academy.identity_session where id=$1', [digest])).rows[0]
    expect(after.expires_at).toEqual(before.expires_at)
    expect(after.authentication_time).toBe(before.authentication_time)
    expect(after.last_seen_at.getTime()).toBeGreaterThan(before.last_seen_at.getTime())
  })
  it('does not record activity when the durable projection is unhealthy', async () => {
    await activate(subject, email)
    await createV2()
    const before = (await admin.query('select last_seen_at from academy.identity_session where id=$1', [digest])).rows[0].last_seen_at
    await admin.query(`update academy.identity_lifecycle_consumer_checkpoint set configuration_health='config_revision_changed',
      observed_config_revision=2 where consumer_id='academy-web'`)
    expect(await read()).toEqual({ status: 'unknown' })
    const after = (await admin.query('select last_seen_at from academy.identity_session where id=$1', [digest])).rows[0].last_seen_at
    expect(after).toEqual(before)
  })
  it('rechecks idle expiry after waiting for the principal lock', async () => {
    await activate(subject, email)
    await createV2()
    const blocker = new Client({ connectionString: databaseUrl })
    const reader = new Client({ connectionString: databaseUrl })
    await blocker.connect(); await reader.connect()
    try {
      const blockerPid = (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid
      const readerPid = (await reader.query('select pg_backend_pid() as pid')).rows[0].pid
      await blocker.query('begin')
      await blocker.query('select pg_advisory_xact_lock(hashtextextended(jsonb_build_array($1::text,$2::text)::text,0))', [ISSUER, subjectKey(subject)])
      const pending = read(reader)
        .then((value) => ({ value }), (error: unknown) => ({ error }))
      let blocked = false
      for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
        blocked = (await admin.query(
          'select $1::int = any(pg_blocking_pids($2::int)) as blocked',
          [blockerPid, readerPid],
        )).rows[0]?.blocked === true
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(blocked).toBe(true)
      await blocker.query(`update academy.identity_session set created_at=clock_timestamp()-interval '31 minutes',
        last_seen_at=clock_timestamp()-interval '30 minutes' where id=$1`, [digest])
      await blocker.query('commit')
      const settled = await pending
      if ('error' in settled) throw settled.error
      expect(settled.value).toEqual({ status: 'expired' })
    } finally { await blocker.query('rollback'); await blocker.end(); await reader.end() }
  })
  async function checkpointFixture() {
    const state = 'S'.repeat(43), binding = 'B'.repeat(43), claim = 'C'.repeat(43)
    const now = Number((await admin.query('select floor(extract(epoch from clock_timestamp()))::bigint as now')).rows[0].now)
    await admin.query(`select academy.create_identity_authorization_transaction(
      $1,$2,$3,$4,'academy-web','https://academy.example.test/auth/callback','academy',
      'https://academy.example.test',$5,'https://accounts.example.test/v1/code/exchange','/dashboard',600)`,
    [state, 'P'.repeat(43), 'N'.repeat(43), binding, ISSUER])
    await admin.query(`select academy.claim_identity_authorization_transaction_digest($1,$2,$3,$4,60)`, [state,binding,claim,digest])
    const response = await admin.query(`select academy.checkpoint_identity_authorization_exchange_v2(
      $1,$2,$3,$4,$5,'active',1,$6::bigint) as result`, [state,claim,ISSUER,subject,email,now-300])
    expect(response.rows[0].result).toEqual({ status: 'checkpointed' })
    return { state, binding, claim, authTime: now-300 }
  }
  it('preserves auth_time on checkpoint retry and refuses replacing it with a newer time', async () => {
    const fixture = await checkpointFixture()
    const mismatch = await admin.query(`select academy.checkpoint_identity_authorization_exchange_v2(
      $1,$2,$3,$4,$5,'active',1,$6::bigint) as result`,
    [fixture.state,fixture.claim,ISSUER,subject,email,fixture.authTime+1])
    expect(mismatch.rows[0].result).toEqual({ status: 'result_mismatch' })
    await admin.query(`select academy.release_identity_authorization_transaction_claim($1,$2,'profile_activation')`, [fixture.state, fixture.claim])
    const resumed = await admin.query(`select academy.claim_identity_authorization_transaction_digest($1,$2,$3,$4,60) as result`,
      [fixture.state,fixture.binding,fixture.claim,digest])
    expect(resumed.rows[0].result.exchangeResult.authentication).toEqual({ method: 'webauthn_uv', auth_time: fixture.authTime })
    expect(resumed.rows[0].result.exchangeResult.version).toBe(2)
  })
  it('requires explicit reauthentication for stale or legacy checkpoint resume', async () => {
    const fixture = await checkpointFixture()
    for (const oldTime of [1, null]) {
      await admin.query('update academy.identity_authorization_transaction set result_authentication_time=$2 where state=$1', [fixture.state,oldTime])
      const resumed = await admin.query(`select academy.claim_identity_authorization_transaction_digest($1,$2,$3,$4,60) as result`,
        [fixture.state,fixture.binding,fixture.claim,digest])
      expect(resumed.rows[0].result).toEqual({ status: 'reauthentication_required' })
    }
  })
  it('atomically finalizes only the exact checkpoint authentication and a usable session', async () => {
    const accountId = await activate(subject, email)
    const fixture = await checkpointFixture()
    await createV2(admin, fixture.authTime)
    const completed = await admin.query(`select academy.finalize_identity_authorization_transaction_digest($1,$2,$3,$4,$5) as result`,
      [fixture.state,fixture.claim,accountId,digest,subjectKey(subject)])
    expect(completed.rows[0].result).toEqual({ status: 'completed' })
  })
  it('refuses a validly shaped subject key which is not bound to the checkpoint result subject', async () => {
    const accountId = await activate(subject, email)
    const fixture = await checkpointFixture()
    await createV2(admin, fixture.authTime)
    const completed = await admin.query(`select academy.finalize_identity_authorization_transaction_digest($1,$2,$3,$4,$5) as result`,
      [fixture.state, fixture.claim, accountId, digest, subjectKey('different-subject')])
    expect(completed.rows[0].result).toEqual({ status: 'result_mismatch' })
    expect((await admin.query('select completed_at from academy.identity_authorization_transaction where state=$1', [fixture.state])).rows[0].completed_at).toBeNull()
  })
  it('refuses stale checkpoint finalization while leaving its timestamp unchanged', async () => {
    const accountId = await activate(subject, email)
    const fixture = await checkpointFixture()
    await createV2(admin, fixture.authTime)
    await admin.query('update academy.identity_authorization_transaction set result_authentication_time=1 where state=$1', [fixture.state])
    const completed = await admin.query(`select academy.finalize_identity_authorization_transaction_digest($1,$2,$3,$4,$5) as result`,
      [fixture.state,fixture.claim,accountId,digest,subjectKey(subject)])
    expect(completed.rows[0].result).toEqual({ status: 'reauthentication_required' })
    const stored = (await admin.query('select result_authentication_time,completed_at from academy.identity_authorization_transaction where state=$1', [fixture.state])).rows[0]
    expect(stored).toEqual({ result_authentication_time: '1', completed_at: null })
  })
  it('rejects a UV session row with null authentication time as a table invariant', async () => {
    await activate(subject,email); await createV2()
    await expect(admin.query('update academy.identity_session set authentication_time=null where id=$1',[digest])).rejects.toThrow(/identity_session_authentication_check/)
  })
  it('peeks without recording authenticated activity and fails closed on expiry', async () => {
    await activate(subject, email); await createV2()
    await admin.query("update academy.identity_session set last_seen_at=clock_timestamp()-interval '10 minutes' where id=$1", [digest])
    const before=(await admin.query('select last_seen_at from academy.identity_session where id=$1',[digest])).rows[0].last_seen_at
    expect((await admin.query('select academy.peek_identity_session_digest($1) as result',[digest])).rows[0].result.status).toBe('active')
    expect((await admin.query('select last_seen_at from academy.identity_session where id=$1',[digest])).rows[0].last_seen_at).toEqual(before)
    await admin.query("update academy.identity_session set last_seen_at=clock_timestamp()-interval '30 minutes' where id=$1",[digest])
    expect((await admin.query('select academy.peek_identity_session_digest($1) as result',[digest])).rows[0].result).toEqual({status:'expired'})
  })
  it('does not finalize a session which expires while waiting for its row lock', async () => {
    const accountId=await activate(subject,email), fixture=await checkpointFixture()
    await createV2(admin,fixture.authTime)
    const blocker=new Client({connectionString:databaseUrl}), finalizer=new Client({connectionString:databaseUrl})
    await blocker.connect(); await finalizer.connect()
    try {
      await blocker.query('begin')
      await blocker.query('select id from academy.identity_session where id=$1 for update',[digest])
      const pid=(await finalizer.query('select pg_backend_pid() as pid')).rows[0].pid
      const pending=finalizer.query('select academy.finalize_identity_authorization_transaction_digest($1,$2,$3,$4,$5) as result',
        [fixture.state,fixture.claim,accountId,digest,subjectKey(subject)])
        .then((value) => ({ value }), (error: unknown) => ({ error }))
      let waiting=false
      for(let n=0;n<100&&!waiting;n++) {
        waiting=(await admin.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock'
        if(!waiting) await new Promise(r=>setTimeout(r,10))
      }
      expect(waiting).toBe(true)
      await blocker.query("update academy.identity_session set created_at=clock_timestamp()-interval '2 seconds', expires_at=clock_timestamp()-interval '1 second' where id=$1",[digest])
      await blocker.query('commit')
      const settled = await pending
      if ('error' in settled) throw settled.error
      expect(settled.value.rows[0].result).toEqual({status:'session_mismatch'})
      expect((await admin.query('select completed_at from academy.identity_authorization_transaction where state=$1',[fixture.state])).rows[0].completed_at).toBeNull()
    } finally { await blocker.query('rollback'); await blocker.end(); await finalizer.end() }
  })
  it('denies runtime legacy creation/checkpoint while permitting the exact v2 RPC', async () => {
    await activate(subject, email)
    const runtime = new Client({ connectionString: databaseUrl }); await runtime.connect()
    try {
      await runtime.query('set role academy_runtime')
      await expect(createSession(bearer, subject, email, 1, runtime)).rejects.toThrow(/permission denied/)
      expect((await createV2(runtime)).status).toBe('created')
      const privileges = await runtime.query(`select
        has_function_privilege(current_user,'academy.checkpoint_identity_authorization_exchange(text,text,text,text,text,text,bigint)','execute') as legacy,
        has_function_privilege(current_user,'academy.checkpoint_identity_authorization_exchange_v2(text,text,text,text,text,text,bigint,bigint)','execute') as v2`)
      expect(privileges.rows[0]).toEqual({ legacy: false, v2: true })
    } finally { await runtime.end() }
  })
})

describe('attempt recovery remains bound to the same owner and attempt', () => {
  const attemptId='a844e5f5-9f60-46dc-9cf9-a2c5d6d41521'
  async function fixture() {
    const account=await activate('attempt-recovery-owner','attempt-recovery@example.test')
    await admin.query(`insert into academy.attempt(attempt_id,user_id,course_slug,node_id,challenge_id,params,challenge_version,expires_at)
      values($1,$2,'fixture-course','fixture-node','checkpoint','{"private":"fixture"}', 'v1',clock_timestamp()+interval '60 minutes')`,[attemptId,account])
    return account
  }
  async function inspect(account:string,slug='fixture-course',node='fixture-node') {
    return (await admin.query('select academy.inspect_attempt_reauthentication($1,$2,$3,$4) as result',[attemptId,account,slug,node])).rows[0].result
  }
  it('reads exact active ownership without changing expiry, parameters or consumption',async()=>{
    const account=await fixture()
    const before=(await admin.query('select * from academy.attempt where attempt_id=$1',[attemptId])).rows[0]
    expect(await inspect(account)).toBe('active')
    expect((await admin.query('select * from academy.attempt where attempt_id=$1',[attemptId])).rows[0]).toEqual(before)
  })
  it('does not leak availability to another account, course, node or progress epoch',async()=>{
    const account=await fixture(), other=await activate('attempt-recovery-other','attempt-other@example.test')
    expect(await inspect(other)).toBe('invalid');expect(await inspect(account,'wrong-course')).toBe('invalid');expect(await inspect(account,'fixture-course','wrong-node')).toBe('invalid')
    await admin.query("insert into academy.course_progress_epoch(user_id,course_slug,epoch) values($1,'fixture-course',1)",[account])
    expect(await inspect(account)).toBe('invalid')
  })
  it('reconciles completed and in-flight work without extending a sixty minute attempt',async()=>{
    const account=await fixture()
    await admin.query("update academy.attempt set claim_token='11111111-1111-4111-8111-111111111111',consumed_at=clock_timestamp() where attempt_id=$1",[attemptId])
    expect(await inspect(account)).toBe('pending')
    await admin.query("update academy.attempt set consumed_at=clock_timestamp()-interval '31 seconds' where attempt_id=$1",[attemptId])
    expect(await inspect(account)).toBe('active')
    await admin.query("update academy.attempt set expires_at=clock_timestamp()-interval '1 second' where attempt_id=$1",[attemptId])
    expect(await inspect(account)).toBe('invalid')
    await admin.query("update academy.attempt set outcome='{}'::jsonb where attempt_id=$1",[attemptId])
    expect(await inspect(account)).toBe('completed')
  })
})
