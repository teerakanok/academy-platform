const SPECIFICATION = {
  schema: 'academy-identity-lifecycle-disabled-rehearsal/v1',
  academySourceRevision: 'be72bd4978b616bcd8d782dfc80106ab27780f67',
  identityControlSourceRevision: 'd95efebd518c83f711767947ced6c69b14c05881',
  intakeFixture: {
    path: 'evidence/identity-lifecycle-disabled-rehearsal-intake-contract.v1.json',
    sha256: 'f67381f6dfb9f6314322b0b78d028b340664bd133b64d7ba133bd938fd8d9b66',
  },
  selectedValues: {
    publisherEndpoint: 'https://identity-control.internal/v1/lifecycle/events/pull',
    clientAssertionAudience: 'https://identity-control.internal/v1/lifecycle/events/pull',
    eventAudience: 'https://academy.cyberskills.co.th/lifecycle/events',
  },
  acceptanceBoundary: {
    registryRemainsDisabled: true,
    registryLifecycleValuesRemainNull: true,
    lifecycleTrafficEnabled: false,
    productionAuthorityClaimed: false,
    releaseApproval: false,
  },
}

const ADVISORY_FINDINGS = Object.freeze([
  'receipts 1/5',
  'blockers 1/6',
  'ordered 3/8',
  'authority NONE',
  'operations 0',
])
const COMPACT_JWS_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export class DisabledLifecycleRehearsalError extends Error {
  constructor() {
    super('Disabled lifecycle rehearsal rejected')
    this.name = 'DisabledLifecycleRehearsalError'
  }
}

export const DISABLED_LIFECYCLE_REHEARSAL_SPECIFICATION = deepFreeze(structuredClone(SPECIFICATION))

export function parseDisabledLifecycleRehearsalSpecification(source) {
  try {
    if (typeof source !== 'string') throw new DisabledLifecycleRehearsalError()
    return validateDisabledLifecycleRehearsalSpecification(parseDuplicateSafeJson(source))
  } catch (error) {
    if (error instanceof DisabledLifecycleRehearsalError) throw error
    throw new DisabledLifecycleRehearsalError()
  }
}

export function validateDisabledLifecycleRehearsalSpecification(value) {
  try {
    assertExactObject(value, [
      'schema',
      'academySourceRevision',
      'identityControlSourceRevision',
      'intakeFixture',
      'selectedValues',
      'acceptanceBoundary',
    ])
    assertExactObject(value.intakeFixture, ['path', 'sha256'])
    assertExactObject(value.selectedValues, [
      'publisherEndpoint',
      'clientAssertionAudience',
      'eventAudience',
    ])
    assertExactObject(value.acceptanceBoundary, [
      'registryRemainsDisabled',
      'registryLifecycleValuesRemainNull',
      'lifecycleTrafficEnabled',
      'productionAuthorityClaimed',
      'releaseApproval',
    ])
    if (!sameJson(value, SPECIFICATION)) throw new DisabledLifecycleRehearsalError()
    return deepFreeze(structuredClone(SPECIFICATION))
  } catch (error) {
    if (error instanceof DisabledLifecycleRehearsalError) throw error
    throw new DisabledLifecycleRehearsalError()
  }
}

export async function rehearseDisabledLifecyclePull(specification, ports) {
  try {
    const selected = validateDisabledLifecycleRehearsalSpecification(specification).selectedValues
    assertExactObject(ports, ['createClientAssertion', 'sendAuthenticatedPull'])
    if (typeof ports.createClientAssertion !== 'function' || typeof ports.sendAuthenticatedPull !== 'function') {
      throw new DisabledLifecycleRehearsalError()
    }

    const clientAssertion = await ports.createClientAssertion({
      consumerId: 'academy-web',
      audience: selected.clientAssertionAudience,
    })
    if (typeof clientAssertion !== 'string' || !COMPACT_JWS_PATTERN.test(clientAssertion)) {
      throw new DisabledLifecycleRehearsalError()
    }

    await ports.sendAuthenticatedPull({
      endpoint: selected.publisherEndpoint,
      eventAudience: selected.eventAudience,
      request: {
        consumerId: 'academy-web',
        clientAssertion,
        limit: 1,
      },
    })
    return createAdvisoryResult()
  } catch (error) {
    if (error instanceof DisabledLifecycleRehearsalError) throw error
    throw new DisabledLifecycleRehearsalError()
  }
}

function createAdvisoryResult() {
  return deepFreeze({
    status: 'PENDING_ACADEMY_SUBMISSION',
    summary: 'Academy remains disabled; this inert authenticated-pull rehearsal grants no production authority.',
    findings: [...ADVISORY_FINDINGS],
    changed_files: [],
  })
}

function assertExactObject(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DisabledLifecycleRehearsalError()
  }
  const keys = Object.keys(value).sort()
  if (keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== [...expectedKeys].sort()[index])) {
    throw new DisabledLifecycleRehearsalError()
  }
}

function sameJson(left, right) {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]))
  }
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]))
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function parseDuplicateSafeJson(source) {
  let index = 0

  const fail = () => { throw new DisabledLifecycleRehearsalError() }
  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? '')) index += 1
  }
  const readString = () => {
    if (source[index] !== '"') fail()
    const start = index
    index += 1
    while (index < source.length) {
      const character = source[index]
      if (character === '"') {
        index += 1
        try {
          return JSON.parse(source.slice(start, index))
        } catch {
          fail()
        }
      }
      if (character === '\\') index += 1
      index += 1
    }
    fail()
  }
  const readValue = () => {
    skipWhitespace()
    const character = source[index]
    if (character === '"') return readString()
    if (character === '{') return readObject()
    if (character === '[') return readArray()
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, index)) {
        index += literal.length
        return literal === 'true' ? true : literal === 'false' ? false : null
      }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(index))
    if (!match) fail()
    index += match[0].length
    const number = Number(match[0])
    if (!Number.isFinite(number)) fail()
    return number
  }
  const readObject = () => {
    const object = Object.create(null)
    const keys = new Set()
    index += 1
    skipWhitespace()
    if (source[index] === '}') {
      index += 1
      return object
    }
    while (true) {
      skipWhitespace()
      const key = readString()
      if (keys.has(key)) fail()
      keys.add(key)
      skipWhitespace()
      if (source[index] !== ':') fail()
      index += 1
      object[key] = readValue()
      skipWhitespace()
      if (source[index] === '}') {
        index += 1
        return object
      }
      if (source[index] !== ',') fail()
      index += 1
    }
  }
  const readArray = () => {
    const values = []
    index += 1
    skipWhitespace()
    if (source[index] === ']') {
      index += 1
      return values
    }
    while (true) {
      values.push(readValue())
      skipWhitespace()
      if (source[index] === ']') {
        index += 1
        return values
      }
      if (source[index] !== ',') fail()
      index += 1
    }
  }

  const parsed = readValue()
  skipWhitespace()
  if (index !== source.length) fail()
  return parsed
}
