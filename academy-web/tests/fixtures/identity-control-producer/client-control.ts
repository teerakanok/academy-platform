export type VerificationKeyState = 'active' | 'overlap' | 'retired'

export interface VerificationKeyRecord {
  keyId: string
  algorithm: 'ES256'
  publicKeyReference: string
  state: VerificationKeyState
}

interface ClientControlRecord {
  keys: Map<string, VerificationKeyRecord>
}

export class ClientControlError extends Error {
  constructor(readonly code: 'client_not_found' | 'key_not_found' | 'active_key_exists' | 'last_active_key') {
    super(code)
    this.name = 'ClientControlError'
  }
}

export class ClientControlRegistry {
  readonly #clients = new Map<string, ClientControlRecord>()

  register(clientId: string, key: Omit<VerificationKeyRecord, 'state'>): void {
    if (this.#clients.has(clientId)) throw new ClientControlError('active_key_exists')
    this.#clients.set(clientId, {
      keys: new Map([[key.keyId, { ...key, state: 'active' }]]),
    })
  }

  rotate(clientId: string, key: Omit<VerificationKeyRecord, 'state'>): void {
    const client = this.#requireClient(clientId)
    if (client.keys.has(key.keyId)) throw new ClientControlError('active_key_exists')
    for (const current of client.keys.values()) {
      if (current.state === 'active') current.state = 'overlap'
    }
    client.keys.set(key.keyId, { ...key, state: 'active' })
  }

  retire(clientId: string, keyId: string): void {
    const client = this.#requireClient(clientId)
    const key = client.keys.get(keyId)
    if (!key) throw new ClientControlError('key_not_found')
    if (key.state === 'active' && ![...client.keys.values()].some((candidate) => candidate.keyId !== keyId && candidate.state === 'active')) {
      throw new ClientControlError('last_active_key')
    }
    key.state = 'retired'
  }

  canVerifyKey(clientId: string, keyId: string): boolean {
    const client = this.#clients.get(clientId)
    if (!client) return false
    const state = client.keys.get(keyId)?.state
    return state === 'active' || state === 'overlap'
  }

  snapshot(clientId: string): { keys: VerificationKeyRecord[] } {
    const client = this.#requireClient(clientId)
    return {
      keys: [...client.keys.values()].map((key) => structuredClone(key)),
    }
  }

  #requireClient(clientId: string): ClientControlRecord {
    const client = this.#clients.get(clientId)
    if (!client) throw new ClientControlError('client_not_found')
    return client
  }
}
