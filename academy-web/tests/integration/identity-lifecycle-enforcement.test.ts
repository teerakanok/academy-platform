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
  ).join('\n')
  await admin.query('BEGIN;\n' + bootstrap + '\nROLLBACK;')
  await admin.query('BEGIN;\n' + bootstrap + '\nCOMMIT;')
})

afterEach(async () => {
  await admin.query('delete from academy.course_entitlement_audit')
  await admin.query(`truncate table academy.identity_session,
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
      await commitUnderLease(null, 'runtime-effective', [
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
