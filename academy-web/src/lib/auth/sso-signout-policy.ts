import { APPROVED_ACADEMY_CONSUMER_REGISTRY_V1 } from '../identity/consumer-policy'

export const ACADEMY_SSO_ORIGIN = APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.accountCenter.origin
export const ACADEMY_SSO_SIGNOUT_URL = `${ACADEMY_SSO_ORIGIN}/v1/sessions/signout`

