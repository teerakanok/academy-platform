import { projectAttemptProfileResult } from '../../src/lib/profile/attempt-evidence.ts'

/** At-least-once delivery: Core's immutable result identity makes a lost acknowledgement safe to retry. */
export async function exportAttemptProfileCycle({ store, transport, trustedIssuer }) {
  if (!transport.enabled) return { status: 'disabled', delivered: 0, blocked: {} }
  let cursor = null
  let delivered = 0
  const blocked = {}
  for (;;) {
    const rows = await store.readPending(cursor, 200)
    if (rows.length === 0) break
    let ready = []
    for (const row of rows) {
      const projected = projectAttemptProfileResult(row, trustedIssuer)
      if (projected.ok) ready.push({ id: row.source_key ?? row.attempt_id, event: projected.event })
      else blocked[projected.reason] = (blocked[projected.reason] ?? 0) + 1
    }
    if (ready.length) {
      const prepared = new Set(await store.prepare(ready.map((entry) => entry.id)))
      const rejected = ready.filter((entry) => !prepared.has(entry.id)).length
      if (rejected) blocked.source_not_admitted = (blocked.source_not_admitted ?? 0) + rejected
      ready = ready.filter((entry) => prepared.has(entry.id))
      if (ready.length) {
        await transport.ingest(ready.map((entry) => entry.event))
        await store.acknowledge(ready.map((entry) => entry.id))
        delivered += ready.length
      }
    }
    cursor = rows.at(-1).source_key ?? rows.at(-1).attempt_id
  }
  return { status: 'completed', delivered, blocked }
}

export function postgresProfileResultStore(db) {
  return {
    async readPending(after, limit) {
      const { rows } = await db.query(`select * from (
        select r.attempt_id::text, r.attempt_id::text || ':0' as source_key,
          r.snapshot, r.passed, r.recorded_at, 'active' as state
        from academy.attempt_profile_result r
        join academy.service_activation a on a.user_id = r.user_id and a.status = 'active'
        join academy.profile_source_policy p on p.id and p.enabled and p.qa_exclusions_initialized
        where r.delivered_at is null
          and not exists (select 1 from academy.profile_activity_classification c where c.user_id = r.user_id and c.is_test)
          and not exists (select 1 from academy.profile_result_revocation v where v.attempt_id = r.attempt_id)
        union all
        select v.attempt_id::text, v.attempt_id::text || ':1', v.snapshot, true, v.recorded_at, 'revoked'
        from academy.profile_result_revocation v where v.delivered_at is null
      ) source where ($1::text is null or source_key > $1) order by source_key limit $2`, [after, limit])
      return rows.map((row) => ({ ...row, recorded_at: row.recorded_at instanceof Date
        ? row.recorded_at.toISOString() : row.recorded_at }))
    },
    async prepare(ids) {
      const { rows } = await db.query('select source_key from academy.prepare_profile_result_export($1::text[])', [ids])
      return rows.map((row) => row.source_key)
    },
    async acknowledge(ids) {
      await db.query(`update academy.attempt_profile_result set delivered_at = now()
        where attempt_id::text || ':0' = any($1::text[]) and delivered_at is null`, [ids])
      await db.query(`update academy.profile_result_revocation set delivered_at = now(), snapshot = null
        where attempt_id::text || ':1' = any($1::text[]) and delivered_at is null`, [ids])
    },
  }
}
