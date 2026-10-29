'use client'

import { useEffect, useState } from 'react'
import { publicShareSchema, type PublicShare } from '@/core-profile-ui/contracts'
import { AcademySharedProfile } from './AcademyProfileSurface'

export function AcademyPublicProfile({ shareId }: { shareId: string }) {
  const [state, setState] = useState<{ status: 'loading' | 'unavailable' } | { status: 'ready'; share: PublicShare }>({ status: 'loading' })
  useEffect(() => {
    const secret = window.location.hash.slice(1)
    if (!/^shr_[0-9a-f]{32}$/.test(shareId) || !/^[0-9a-f]{64}$/.test(secret)) {
      setState({ status: 'unavailable' })
      return
    }
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/profile/public/read', {
          method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shareId, secret }), signal: controller.signal,
        })
        if (!response.ok) throw new Error('Share unavailable')
        const share = publicShareSchema.parse(await response.json())
        if (!controller.signal.aborted) setState({ status: 'ready', share })
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' })
      }
    })()
    return () => controller.abort()
  }, [shareId])

  if (state.status === 'ready') return <AcademySharedProfile share={state.share} />
  return <main className="academy-profile-unavailable" role="status">
    <h1>Shared skills profile</h1>
    <p>{state.status === 'loading' ? 'Loading shared profile…' : 'This share link is unavailable.'}</p>
  </main>
}
