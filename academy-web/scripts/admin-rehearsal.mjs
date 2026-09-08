export function assertExclusiveModes({ apply, rehearse }) {
  if (apply && rehearse) throw new Error('--rehearse is mutually exclusive with --apply')
  return rehearse ? 'rehearse' : apply ? 'apply' : 'inspect'
}

export function assertSnapshotEqual(label, expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`${label} verification failed`)
  }
}

export async function rehearseMutation({
  client,
  inspectState,
  inspectAudit,
  mutate,
  expectedActive,
  expectedActorAuthorized,
  verifyIntendedAudit,
  output,
}) {
  const beforeState = await inspectState()
  const beforeAudit = await inspectAudit()
  await client.query('begin')
  try {
    const changed = await mutate()
    const transactionState = await inspectState()
    const transactionAudit = await inspectAudit()

    if (transactionState.actorAuthorized !== (expectedActorAuthorized ?? beforeState.actorAuthorized)) {
      throw new Error('in-transaction authorization verification failed')
    }
    if (transactionState.active !== expectedActive) {
      throw new Error('in-transaction state verification failed')
    }
    if (changed) {
      verifyIntendedAudit(transactionAudit)
    } else {
      assertSnapshotEqual('in-transaction audit', beforeAudit, transactionAudit)
    }
    await client.query('rollback')

    const restoredState = await inspectState()
    const restoredAudit = await inspectAudit()
    assertSnapshotEqual('original state restoration', beforeState, restoredState)
    assertSnapshotEqual('original audit restoration', beforeAudit, restoredAudit)
    output({ changed, state: transactionState })
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
}
