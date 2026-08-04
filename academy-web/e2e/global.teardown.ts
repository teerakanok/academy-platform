import { Client } from 'pg'

const CONTROL_ISSUER = 'https://e2e-staff-control.invalid'

export default async function globalTeardown() {
  if (process.env.INTERNAL_SURFACES?.trim() !== 'on') return
  const databaseUrl = process.env.TEST_DATABASE_URL
  if (!databaseUrl) throw new Error('internal E2E teardown ต้องมี TEST_DATABASE_URL')

  const db = new Client({ connectionString: databaseUrl })
  await db.connect()
  try {
    await db.query('begin')
    const accounts = await db.query(
      `select id from academy.users
        where issuer = $1`,
      [CONTROL_ISSUER],
    )
    const ids = accounts.rows.map((row) => row.id)
    if (ids.length > 0) {
      await db.query(
        `delete from academy.staff_role_assignment a
          using academy.staff_role_audit e
          where e.authorization_reference in ('E2E-STAFF-BOOTSTRAP', 'E2E-STAFF-CONTENT')
            and a.account_id = e.account_id and a.role = e.role`,
      )
      await db.query(
        `delete from academy.staff_role_audit
          where authorization_reference in ('E2E-STAFF-BOOTSTRAP', 'E2E-STAFF-CONTENT')`,
      )
      await db.query(`delete from academy.users where issuer = $1`, [CONTROL_ISSUER])
    }
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
}
