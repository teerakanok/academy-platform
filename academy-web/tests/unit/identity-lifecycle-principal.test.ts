import { describe, expect, it } from 'vitest'
import {
  IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN,
  IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN_SENTINEL,
  isCanonicalIdentityLifecyclePrincipalIssuer,
  isWellFormedIdentityLifecycleSubject,
} from '@/lib/identity/lifecycle-principal'

const ACCEPTED_ISSUERS = [
  'https://accounts.example.test/',
  'https://accounts.example.test/auth/v1',
  'https://accounts.example.test/auth/v1/',
  'https://supabase.cyberskills.co.th/auth/v1',
] as const

const REJECTED_ISSUERS = [
  'https://ACCOUNTS.example.test/auth/v1',
  'https://accounts.example.test:443/auth/v1',
  'https://accounts.example.test/a/../auth/v1',
  'https://accounts.example.test/auth/v1?tenant=one',
  'https://accounts.example.test/auth/v1#fragment',
  'https://user@accounts.example.test/auth/v1',
  'https://accounts.example.test',
  'https://accounts.example.test/auth%2Fv1',
  'https://accounts.example.test//auth/v1',
  'https://a.1/',
  'https://127.1/',
  'https://0x7f.1/',
  'https://0177.0.0.1/',
  'https://127.000.000.001/',
  'https://xn--a.example/',
  'https://xn--abc.example/',
  'https://xn--bcher-kva.example/',
  'https://identity-control.example.test/',
  'https://accounts.example.test/\n',
  'https://accounts.example.test/\r',
] as const

describe('Identity lifecycle principal contract', () => {
  it('pins the exact producer-owned portable issuer pattern', () => {
    expect(IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN_SENTINEL).toBe('#')
    expect(IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN).toBe(
      '^https://[a-z][a-z0-9]{0,29}([.][a-z][a-z0-9]{0,29}){1,7}(/|(/[A-Za-z0-9_-]+)+/?)#$',
    )
  })

  it.each(ACCEPTED_ISSUERS)('accepts producer vector issuer %s', (issuer) => {
    expect(isCanonicalIdentityLifecyclePrincipalIssuer(issuer)).toBe(true)
  })

  it.each(REJECTED_ISSUERS)('rejects producer vector issuer %s', (issuer) => {
    expect(isCanonicalIdentityLifecyclePrincipalIssuer(issuer)).toBe(false)
  })

  it('matches the producer UTF-16 subject boundary', () => {
    for (const subject of [
      'learner-a',
      'ก'.repeat(512),
      '😀'.repeat(256),
      '\ud800\udc00',
    ]) {
      expect(isWellFormedIdentityLifecycleSubject(subject)).toBe(true)
    }

    for (const subject of [
      '',
      'a'.repeat(513),
      '😀'.repeat(257),
      'nul\0subject',
      '\ud800',
      '\udc00',
      'before\ud800after',
      'before\udc00after',
    ]) {
      expect(isWellFormedIdentityLifecycleSubject(subject)).toBe(false)
    }
  })
})
