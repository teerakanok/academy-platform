import type { Metadata } from 'next'
import { UnsubscribeForm } from './UnsubscribeForm'

export const metadata: Metadata = {
  title: 'Email preferences',
  description: 'Manage CyberSkills Academy marketing email preferences.',
  referrer: 'no-referrer',
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}) {
  const params = await searchParams
  const requestedLocale = params.lang === 'th' || params.lang === 'en' ? params.lang : null
  return <UnsubscribeForm requestedLocale={requestedLocale} />
}
