/**
 * Scaffolding — awaiting rollout wiring (independent review F4, 2026-09-12).
 * Nothing imports this yet; wiring it into the login flow is a product rollout
 * decision tied to lifecycle enablement authority and must not be read as live
 * first-login coverage. The catch-up itself is fail-closed by design.
 */
import type {
  IdentityLifecycleConsumerSnapshot,
  IdentityLifecycleDurableProjection,
  IdentityLifecycleSnapshotStore,
} from './lifecycle-page-store'

export type { IdentityLifecycleDurableProjection }
import type { IdentityLifecyclePullCycleResult } from './lifecycle-pull-cycle'
import {
  isCanonicalIdentityLifecyclePrincipalIssuer,
  isWellFormedIdentityLifecycleSubject,
} from './lifecycle-principal'

export const IDENTITY_LIFECYCLE_FIRST_LOGIN_MAX_PAGES = 20

export type IdentityLifecycleFirstLoginPrincipal = Readonly<{
  issuer: string
  subject: string
}>

export type IdentityLifecycleFirstLoginCatchupResult =
  | { outcome: 'ready'; projection: IdentityLifecycleDurableProjection }
  | { outcome: 'unavailable'; reason: IdentityLifecycleFirstLoginUnavailableReason }

export type IdentityLifecycleFirstLoginUnavailableReason =
  | 'budget_exhausted'
  | 'empty_page'
  | 'invalid_principal'
  | 'lease_busy'
  | 'publisher_or_store_unavailable'
  | 'unreconciled_configuration'
  | 'missing_or_inactive_projection'

export type IdentityLifecycleFirstLoginPuller = () => Promise<IdentityLifecyclePullCycleResult>

export async function runIdentityLifecycleFirstLoginCatchup({
  store,
  pull,
  principal,
  maximumPages = IDENTITY_LIFECYCLE_FIRST_LOGIN_MAX_PAGES,
}: {
  store: IdentityLifecycleSnapshotStore
  pull: IdentityLifecycleFirstLoginPuller
  principal: IdentityLifecycleFirstLoginPrincipal
  maximumPages?: number
}): Promise<IdentityLifecycleFirstLoginCatchupResult> {
  if (!Number.isSafeInteger(maximumPages)
    || maximumPages < 1
    || maximumPages > 100
    || !isCanonicalIdentityLifecyclePrincipalIssuer(principal.issuer)
    || !isWellFormedIdentityLifecycleSubject(principal.subject)) {
    return { outcome: 'unavailable', reason: 'invalid_principal' }
  }

  const initialSnapshot = await readSnapshotSafely(store)
  if (initialSnapshot === undefined) {
    return { outcome: 'unavailable', reason: 'publisher_or_store_unavailable' }
  }
  if (initialSnapshot?.configuration.health.status === 'ready') {
    const initialProjection = findExactProjection(initialSnapshot, principal)
    if (initialProjection?.health.status === 'ready'
      && initialProjection.current.state === 'active') {
      return { outcome: 'ready', projection: initialProjection }
    }
  }
  let previousCursor = initialSnapshot?.cursor ?? null

  for (let page = 0; page < maximumPages; page += 1) {
    let result: IdentityLifecyclePullCycleResult
    try {
      result = await pull()
    } catch {
      return { outcome: 'unavailable', reason: 'publisher_or_store_unavailable' }
    }
    if (result.outcome === 'lease_busy') {
      return { outcome: 'unavailable', reason: 'lease_busy' }
    }
    if (result.outcome !== 'committed') {
      return { outcome: 'unavailable', reason: 'publisher_or_store_unavailable' }
    }

    const snapshot = await readSnapshotSafely(store)
    if (snapshot == null) {
      return { outcome: 'unavailable', reason: 'publisher_or_store_unavailable' }
    }
    const cursor = snapshot.cursor
    if (snapshot.configuration.health.status !== 'ready') {
      return { outcome: 'unavailable', reason: 'unreconciled_configuration' }
    }
    const projection = findExactProjection(snapshot, principal)
    if (projection?.health.status === 'ready' && projection.current.state === 'active') {
      return { outcome: 'ready', projection }
    }
    if (projection) {
      return { outcome: 'unavailable', reason: 'missing_or_inactive_projection' }
    }
    if (cursor === previousCursor) {
      return { outcome: 'unavailable', reason: 'missing_or_inactive_projection' }
    }
    previousCursor = cursor
  }

  return { outcome: 'unavailable', reason: 'budget_exhausted' }
}

async function readSnapshotSafely(
  store: IdentityLifecycleSnapshotStore,
): Promise<IdentityLifecycleConsumerSnapshot | null | undefined> {
  try {
    const snapshot = await store.read()
    if (snapshot === null) return null
    if (!Array.isArray(snapshot.projections)
      || (typeof snapshot.cursor !== 'string' && snapshot.cursor !== null)) {
      return undefined
    }
    return snapshot
  } catch {
    return undefined
  }
}

function findExactProjection(
  snapshot: IdentityLifecycleConsumerSnapshot,
  principal: IdentityLifecycleFirstLoginPrincipal,
): IdentityLifecycleDurableProjection | null {
  return snapshot.projections.find((projection) => projection.current.issuer === principal.issuer
    && projection.current.subject === principal.subject) ?? null
}


