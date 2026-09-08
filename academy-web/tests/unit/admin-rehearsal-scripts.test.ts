import { describe, expect, it } from 'vitest'
import { main as staffMain, parseStaffArgs } from '../../scripts/manage-staff-role.mjs'
import { internals, runMain as entitlementMain } from '../../scripts/manage-course-entitlement.mjs'

const actorIssuer = 'https://identity.example'
const actorSubject = '11111111-1111-4111-8111-111111111111'
const targetSubject = '22222222-2222-4222-8222-222222222222'

function staffArguments(overrides: string[] = []) {
  return [
    '--enable',
    '--actor-issuer', actorIssuer,
    '--actor-subject', actorSubject,
    '--target-issuer', actorIssuer,
    '--target-subject', targetSubject,
    '--role', 'learner-support',
    '--reference', 'REHEARSAL-STAFF-001',
    ...overrides,
  ]
}

function entitlementArguments(overrides: string[] = []) {
  return [
    '--grant',
    '--actor-issuer', actorIssuer,
    '--actor-subject', actorSubject,
    '--target-issuer', actorIssuer,
    '--target-subject', targetSubject,
    '--course', 'setup-and-environment',
    '--source', 'grant',
    '--reference', 'REHEARSAL-ENTITLEMENT-001',
    ...overrides,
  ]
}

type Query = { sql: string; values?: unknown[] }

function fakeClient(handlers: Array<(query: Query) => Record<string, unknown>[]>) {
  const calls: Query[] = []
  const connections = { connect: 0, end: 0 }
  let handlerIndex = 0
  return {
    calls,
    connections,
    async connect() {
      connections.connect += 1
    },
    async end() {
      connections.end += 1
    },
    async query(sql: string, values?: unknown[]) {
      const query = { sql, values }
      calls.push(query)
      const parameterCount = Math.max(0, ...Array.from(sql.matchAll(/\$(\d+)/g), (match) => Number(match[1])))
      if ((values?.length ?? 0) !== parameterCount) throw new Error('bind parameter count mismatch')
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [], rowCount: 0 }
      if (handlerIndex >= handlers.length) throw new Error(`unexpected query: ${sql}`)
      const rows = handlers[handlerIndex](query)
      handlerIndex += 1
      return { rows, rowCount: rows.length }
    },
  }
}

function staffClient({ active = false, authorized = true, mutationError, restoredState, bootstrap = false }: {
  active?: boolean
  authorized?: boolean
  mutationError?: Error
  restoredState?: boolean
  bootstrap?: boolean
} = {}) {
  const beforeAudit = {
    eventId: '1',
    action: 'revoked',
    authorizationReference: 'PRIOR-AUDIT',
    occurredAt: '2026-01-01T00:00:00+00:00',
  }
  const grantedAudit = {
    eventId: '2',
    action: 'granted',
    authorizationReference: 'REHEARSAL-STAFF-001',
    occurredAt: '2026-01-02T00:00:00+00:00',
  }
  const state = (isActive: boolean) => ({
    actorAuthorized: bootstrap ? isActive : authorized,
    active: isActive,
    lastAuditReference: isActive ? 'REHEARSAL-STAFF-001' : 'PRIOR-AUDIT',
  })
  return fakeClient([
    () => [{ user_name: 'academy_staff_admin' }],
    () => [{ account_id: 'actor-id' }],
    () => [{ account_id: bootstrap ? 'actor-id' : 'target-id' }],
    () => [{ state: state(active) }],
    () => [{ audit: { ...beforeAudit } }],
    () => {
      if (mutationError) throw mutationError
      return [{ changed: true }]
    },
    () => [{ state: state(true) }],
    () => [{ audit: { ...grantedAudit } }],
    () => [{ state: state(restoredState ?? active) }],
    () => [{ audit: { ...beforeAudit } }],
  ])
}

function entitlementClient({ active = false, authorized = true, mutationError, restoredAuditEventId }: {
  active?: boolean
  authorized?: boolean
  mutationError?: Error
  restoredAuditEventId?: string
} = {}) {
  const beforeAudit = {
    eventId: '1',
    accountId: 'target-id',
    courseSlug: 'setup-and-environment',
    action: 'revoked',
    source: 'grant',
    expiresAt: null,
    actorAccountId: 'actor-id',
    authorizationReference: 'PRIOR-AUDIT',
    occurredAt: '2026-01-01T00:00:00+00:00',
  }
  const grantedAudit = {
    eventId: '2',
    accountId: 'target-id',
    courseSlug: 'setup-and-environment',
    action: 'granted',
    source: 'grant',
    expiresAt: null,
    actorAccountId: 'actor-id',
    authorizationReference: 'REHEARSAL-ENTITLEMENT-001',
    occurredAt: '2026-01-02T00:00:00+00:00',
  }
  const state = (isActive: boolean) => ({ actorAuthorized: authorized, active: isActive })
  return fakeClient([
    () => [{ user_name: 'academy_entitlement_operator' }],
    () => [{ account_id: 'actor-id' }],
    () => [{ account_id: 'target-id' }],
    () => [{ state: state(active) }],
    () => [{ audit: { ...beforeAudit } }],
    () => {
      if (mutationError) throw mutationError
      return [{ changed: true }]
    },
    () => [{ state: state(true) }],
    () => [{ audit: { ...grantedAudit } }],
    () => [{ state: state(active) }],
    () => [{ audit: { ...beforeAudit, eventId: restoredAuditEventId ?? '1' } }],
  ])
}

function commands(client: ReturnType<typeof fakeClient>) {
  return client.calls.map(({ sql }) => sql)
}

describe('administrative command rehearsal', () => {
  it('rehearses first-owner bootstrap while authorization changes only inside the transaction', async () => {
    const client = staffClient({ bootstrap: true })
    const lines: string[] = []
    await staffMain({
      argv: staffArguments(['--role', 'owner', '--target-subject', actorSubject, '--rehearse']),
      environment: { DATABASE_URL: 'postgres://redacted' },
      createClient: () => client,
      output: (line: string) => lines.push(line),
    })
    expect(lines).toEqual(['rehearsed=true changed=true role=owner active=true'])
    expect(commands(client)).toContain('rollback')
    expect(commands(client)).not.toContain('commit')
    for (const query of client.calls.filter(({ sql }) => sql.includes('academy.inspect_staff_role_audit'))) {
      expect(query.values).toEqual(['actor-id', 'actor-id', 'owner'])
    }
  })

  it('rejects conflicting execution modes before connecting', () => {
    expect(() => parseStaffArgs(staffArguments(['--apply', '--rehearse']))).toThrow('--rehearse is mutually exclusive with --apply')
    expect(() => internals.parseArgs(entitlementArguments(['--apply', '--rehearse']))).toThrow('--rehearse is mutually exclusive with --apply')
  })

  it('rehearses a staff mutation and proves state and audit restoration', async () => {
    const client = staffClient()
    const lines: string[] = []
    await staffMain({
      argv: staffArguments(['--rehearse']),
      environment: { DATABASE_URL: 'postgres://redacted' },
      createClient: () => client,
      output: (line: string) => lines.push(line),
    })

    expect(lines).toEqual(['rehearsed=true changed=true role=learner-support active=true'])
    const transactionIndex = client.calls.findIndex(({ sql }) => sql === 'begin')
    const rollbackIndex = client.calls.findIndex(({ sql }) => sql === 'rollback')
    expect(transactionIndex).toBeGreaterThan(0)
    expect(rollbackIndex).toBe(transactionIndex + 4)
    expect(commands(client).slice(transactionIndex + 1, rollbackIndex)).toEqual([
      expect.stringContaining('academy.set_staff_role'),
      expect.stringContaining('academy.inspect_staff_role'),
      expect.stringContaining('academy.inspect_staff_role_audit'),
    ])
    expect(client.calls[transactionIndex + 1].values).toEqual([
      'actor-id', 'target-id', 'learner-support', true, 'REHEARSAL-STAFF-001',
    ])
    expect(client.calls.at(-1)?.sql).toContain('academy.inspect_staff_role_audit')
    expect(client.connections).toEqual({ connect: 1, end: 1 })
  })

  it('rolls back and fails when staff mutation or restoration verification fails', async () => {
    const mutationFailure = staffClient({ mutationError: new Error('owner denied mutation') })
    await expect(staffMain({
      argv: staffArguments(['--rehearse']),
      environment: { DATABASE_URL: 'postgres://redacted' },
      createClient: () => mutationFailure,
      output: () => undefined,
    })).rejects.toThrow('owner denied mutation')
    expect(commands(mutationFailure)).toContain('rollback')
    expect(commands(mutationFailure)).not.toContain('commit')
    expect(mutationFailure.connections.end).toBe(1)

    const restorationFailure = staffClient({ restoredState: true })
    await expect(staffMain({
      argv: staffArguments(['--rehearse']),
      environment: { DATABASE_URL: 'postgres://redacted' },
      createClient: () => restorationFailure,
      output: () => undefined,
    })).rejects.toThrow('original state restoration verification failed')
    expect(commands(restorationFailure)).toContain('rollback')
    expect(commands(restorationFailure)).not.toContain('commit')
    expect(restorationFailure.connections.end).toBe(1)
  })

  it('rehearses an entitlement mutation and proves state and audit restoration', async () => {
    const client = entitlementClient()
    const lines: string[] = []
    await entitlementMain({
      argv: entitlementArguments(['--rehearse']),
      environment: { DATABASE_URL: 'postgres://redacted' },
      createClient: () => client,
      output: (line: string) => lines.push(line),
    })

    expect(lines).toEqual(['rehearsed=true changed=true action=grant course=setup-and-environment'])
    expect(commands(client)).toEqual(expect.arrayContaining([
      expect.stringContaining('academy.resolve_entitlement_account'),
      expect.stringContaining('academy.set_course_entitlement'),
      expect.stringContaining('academy.inspect_course_entitlement'),
      expect.stringContaining('academy.inspect_course_entitlement_audit'),
      'rollback',
    ]))
    expect(commands(client)).not.toContain('commit')
    expect(lines.join('\n')).not.toContain(actorIssuer)
    expect(lines.join('\n')).not.toContain(targetSubject)
  })

  it('rolls back and fails when entitlement mutation or audit restoration fails', async () => {
    const mutationFailure = entitlementClient({ mutationError: new Error('owner denied grant') })
    await expect(entitlementMain({
      argv: entitlementArguments(['--rehearse']),
      environment: { DATABASE_URL: 'postgres://redacted' },
      createClient: () => mutationFailure,
      output: () => undefined,
    })).rejects.toThrow('owner denied grant')
    expect(commands(mutationFailure)).toContain('rollback')
    expect(commands(mutationFailure)).not.toContain('commit')

    const auditFailure = entitlementClient({ restoredAuditEventId: '999' })
    const calls = auditFailure.calls
    await expect(entitlementMain({
      argv: entitlementArguments(['--rehearse']),
      environment: { DATABASE_URL: 'postgres://redacted' },
      createClient: () => auditFailure,
      output: () => undefined,
    })).rejects.toThrow('original audit restoration verification failed')
    expect(calls.at(-1)?.sql).toBe('rollback')
    expect(calls.filter(({ sql }) => sql.includes('academy.inspect_course_entitlement_audit'))).toHaveLength(3)
    expect(commands(auditFailure)).toContain('rollback')
  })
})
