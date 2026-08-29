#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const EXPECTED_RELEASE = '4acde50e93285e86171fa4713d4d1c390258c16e'
const EXPECTED_RUNTIME = 'f96a89c5c275fb6e80606f54323d26c8e5d98697b12d2bee917046dea3c61e4d'
const EXPECTED_FREEZE = 'aa45a35f3e2d0bf171c6129aef2390a94ab91acf34137bb34685dce4273d5dca'
const EXPECTED_KEY_SET = 'd6b557027823437a5fe6378fc26bbd8dffad2d8c58a77c2bcf3583f1350e8e35'
const EXPECTED_ACTIVE_KEYS = ['academy-prod-2026-08', 'identity-result-prod-2026-08']
const RESULT_ISSUER = 'https://accounts.cyberskills.co.th/v1/code/results'
const MAX_AGE_MS = 15 * 60 * 1000
const FUTURE_SKEW_MS = 60 * 1000
const EXPECTED_ARTIFACTS = Object.freeze({
  accountCenter: Object.freeze({ bytes: 266240, path: 'ac.tar', sha256: '3227c635dbc9235d1861f133615ed2b761351df50f7c3b93c924b088524759f8' }),
  api: Object.freeze({ bytes: 10127360, path: 'api.tar', sha256: '6e1e9e5b140a977d3799c8677649236a25f76d05bad71de288f6d7eeff4f469c' }),
})

export class IdentityLiveReadinessIntakeError extends Error {
  constructor() {
    super('Identity live readiness intake rejected')
    this.name = 'IdentityLiveReadinessIntakeError'
  }
}

export function intakeIdentityLiveReadiness(source, observedAt = new Date()) {
  try {
    if (typeof source !== 'string' || !(observedAt instanceof Date) || !Number.isFinite(observedAt.valueOf())) fail()
    const receiptSha256 = createHash('sha256').update(source).digest('hex')
    const value = parseDuplicateSafeJson(source)
    if (source !== `${JSON.stringify(value)}\n`) fail()
    exact(value, ['schema','observedAt','releaseSha','runtimeSha256','freezeSha256','keySetSha256','artifacts','activeKeyIds','overlapKeyIds','registry','production','evidence','readiness','capturedAt','expiresAt','independentReview'])
    if (value.schema !== 'identity-control-live-readiness/v1'
      || value.releaseSha !== EXPECTED_RELEASE || !SHA1.test(value.releaseSha)
      || value.runtimeSha256 !== EXPECTED_RUNTIME || value.freezeSha256 !== EXPECTED_FREEZE
      || value.keySetSha256 !== EXPECTED_KEY_SET) fail()

    exact(value.artifacts, ['accountCenter','api'])
    for (const name of ['accountCenter', 'api']) {
      exact(value.artifacts[name], ['bytes','path','sha256'])
      const expected = EXPECTED_ARTIFACTS[name]
      if (value.artifacts[name].bytes !== expected.bytes || value.artifacts[name].path !== expected.path
        || value.artifacts[name].sha256 !== expected.sha256) fail()
    }
    if (!sameExactArray(value.activeKeyIds, EXPECTED_ACTIVE_KEYS) || !sameExactArray(value.overlapKeyIds, [])) fail()

    exact(value.registry, ['academyClient','resultSigning'])
    exact(value.registry.academyClient, ['clientId','serviceId','enabled','keyId','reference'])
    exact(value.registry.resultSigning, ['keyId','issuer','revision','state'])
    const client = value.registry.academyClient
    const signing = value.registry.resultSigning
    if (client.clientId !== 'academy-web' || client.serviceId !== 'academy' || client.enabled !== true
      || client.keyId !== EXPECTED_ACTIVE_KEYS[0]
      || client.reference !== 'config://client-keys/academy-web/academy-prod-2026-08'
      || signing.keyId !== EXPECTED_ACTIVE_KEYS[1] || signing.issuer !== RESULT_ISSUER
      || signing.revision !== 1 || signing.state !== 'active') fail()

    exact(value.production, ['mutationStatus','mutationCounters'])
    exact(value.production.mutationCounters, ['bootstrapClientsAdopted','bootstrapClientsCreated','caddyReloads','migrationsApplied','releasesActivated','servicesStarted'])
    const counters = value.production.mutationCounters
    if (value.production.mutationStatus !== 'COMPLETE'
      || Object.values(counters).some((entry) => !Number.isSafeInteger(entry) || entry < 0)
      || counters.bootstrapClientsAdopted + counters.bootstrapClientsCreated !== 1
      || counters.caddyReloads !== 1 || counters.migrationsApplied < 1
      || counters.releasesActivated !== 1 || counters.servicesStarted !== 1) fail()

    exact(value.evidence, ['freezeSha256','runtimeSha256','keySetSha256','deploymentModeSha256','preflightGoSha256','deployReceiptsSha256','verifyReceiptsSha256','registrySha256','healthSha256','independentReviewSha256'])
    if (Object.values(value.evidence).some((entry) => typeof entry !== 'string' || !SHA256.test(entry))
      || value.evidence.freezeSha256 !== value.freezeSha256
      || value.evidence.runtimeSha256 !== value.runtimeSha256
      || value.evidence.keySetSha256 !== value.keySetSha256) fail()

    exact(value.readiness, ['deploy','verify','registry','localReadyStatus','publicReadyStatus','publicReadyBlocked'])
    if (value.readiness.deploy !== 'GO' || value.readiness.verify !== 'GO' || value.readiness.registry !== 'ACTIVE'
      || value.readiness.localReadyStatus !== 200 || !Number.isInteger(value.readiness.publicReadyStatus)
      || value.readiness.publicReadyStatus < 100 || value.readiness.publicReadyStatus > 599
      || value.readiness.publicReadyStatus === 200 || value.readiness.publicReadyBlocked !== true) fail()

    exact(value.independentReview, ['verdict','reviewer','counts'])
    exact(value.independentReview.counts, ['critical','high','medium','low'])
    if (value.independentReview.verdict !== 'PASS'
      || typeof value.independentReview.reviewer !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._ -]{2,127}$/.test(value.independentReview.reviewer)
      || Object.values(value.independentReview.counts).some((entry) => entry !== 0)) fail()

    const producerObserved = parseCanonicalInstant(value.observedAt)
    const captured = parseCanonicalInstant(value.capturedAt)
    const expires = parseCanonicalInstant(value.expiresAt)
    const now = observedAt.valueOf()
    if (producerObserved < captured || producerObserved > now + FUTURE_SKEW_MS
      || captured > now + FUTURE_SKEW_MS || captured < now - MAX_AGE_MS
      || expires <= captured || expires <= now || expires > captured + MAX_AGE_MS) fail()

    return deepFreeze({
      schema: 'academy-identity-live-readiness-intake/v1',
      status: 'IDENTITY_LIVE_READY',
      receiptSha256,
      releaseSha: value.releaseSha,
      runtimeSha256: value.runtimeSha256,
      freezeSha256: value.freezeSha256,
      keySetSha256: value.keySetSha256,
      capturedAt: value.capturedAt,
      expiresAt: value.expiresAt,
      registry: 'ACTIVE',
      resultSigning: 'ACTIVE',
      independentReview: 'PASS',
      productionMutation: false,
    })
  } catch (error) {
    if (error instanceof IdentityLiveReadinessIntakeError) throw error
    fail()
  }
}

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail()
  const actual = Object.keys(value)
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) fail()
}

function sameExactArray(value, expected) {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length === expected.length && value.every((entry, index) => entry === expected[index])
}

function parseCanonicalInstant(value) {
  if (typeof value !== 'string') fail()
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) fail()
  return parsed.valueOf()
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry)
    Object.freeze(value)
  }
  return value
}

function fail() { throw new IdentityLiveReadinessIntakeError() }

export async function readProtectedIdentityLiveReadiness(path) {
  let handle
  try {
    const absolute = resolve(path)
    const before = await lstat(absolute, { bigint: true })
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || (before.mode & 0o777n) !== 0o600n || before.uid !== BigInt(process.getuid())
      || await realpath(absolute) !== absolute) fail()
    handle = await open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) fail()
    return bytes.toString('utf8')
  } catch (error) {
    if (error instanceof IdentityLiveReadinessIntakeError) throw error
    fail()
  } finally {
    await handle?.close()
  }
}

function parseDuplicateSafeJson(source) {
  let index = 0
  const reject = () => fail()
  const whitespace = () => { while (/\s/.test(source[index] ?? '')) index += 1 }
  const string = () => {
    if (source[index] !== '"') reject()
    const start = index++
    while (index < source.length) {
      if (source[index] === '\\') index += 2
      else if (source[index++] === '"') return JSON.parse(source.slice(start, index))
    }
    reject()
  }
  const value = () => {
    whitespace()
    if (source[index] === '"') return string()
    if (source[index] === '{') return object()
    if (source[index] === '[') return array()
    for (const literal of ['true','false','null']) if (source.startsWith(literal, index)) { index += literal.length; return JSON.parse(literal) }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(index))
    if (!match) reject()
    index += match[0].length
    return Number(match[0])
  }
  const object = () => {
    index++; whitespace(); const result = {}; const keys = new Set()
    if (source[index] === '}') { index++; return result }
    for (;;) {
      whitespace(); const key = string(); if (keys.has(key)) reject(); keys.add(key)
      whitespace(); if (source[index++] !== ':') reject(); result[key] = value(); whitespace()
      if (source[index] === '}') { index++; return result }
      if (source[index++] !== ',') reject()
    }
  }
  const array = () => {
    index++; whitespace(); const result = []
    if (source[index] === ']') { index++; return result }
    for (;;) {
      result.push(value()); whitespace()
      if (source[index] === ']') { index++; return result }
      if (source[index++] !== ',') reject()
    }
  }
  const result = value(); whitespace(); if (index !== source.length) reject(); return result
}

async function main() {
  if (process.argv.length !== 3) fail()
  const receipt = intakeIdentityLiveReadiness(await readProtectedIdentityLiveReadiness(process.argv[2]))
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (entryUrl === import.meta.url) main().catch(() => { process.stderr.write('Identity live readiness intake rejected\n'); process.exitCode = 1 })
