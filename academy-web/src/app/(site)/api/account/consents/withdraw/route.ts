import { handleConsentRequest } from '@/lib/account/consent-route'
export const runtime = 'nodejs'
export const POST = (request: Request) => handleConsentRequest(request, 'withdraw')
