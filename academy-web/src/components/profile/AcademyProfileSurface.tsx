'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useUi } from '@/components/i18n/LocaleProvider'
import { PrivateProfileView, ProfileCard, ProfileHost, type ProfileActions, type ProfileThemeTokens } from '@/core-profile-ui'
import type { LearningProfile, SharedLearningProfile } from '@/core-profile-ui/types'
import './academy-profile.css'

const academyTokens: ProfileThemeTokens = {
  background: 'rgb(var(--cs-bg))',
  panel: 'rgb(var(--cs-surface))',
  panelAlt: 'rgb(var(--cs-surface-2))',
  ink: 'rgb(var(--cs-text))',
  muted: 'rgb(var(--cs-muted))',
  accent: 'rgb(var(--cs-accent-fill))',
  accentText: 'rgb(var(--cs-accent))',
  onAccent: 'rgb(var(--cs-on-accent))',
  accentSoft: 'var(--cs-accent-dim)',
  border: 'rgb(var(--cs-border))',
  borderStrong: 'rgb(var(--cs-border-2))',
  warning: 'rgb(var(--cs-amber))',
  fontFamily: 'var(--font-inter), sans-serif',
}

type Connection =
  | { status: 'unavailable' }
  | {
      status: 'ready'
      profile: LearningProfile
      actions: ProfileActions
      loadProfile: () => Promise<LearningProfile>
    }

function AcademyProfileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="academy-profile">
      <ProfileHost tokens={academyTokens} label="academy">{children}</ProfileHost>
    </div>
  )
}

function ConnectedProfile({ connection }: { connection: Extract<Connection, { status: 'ready' }> }) {
  const [profile, setProfile] = useState(connection.profile)
  const [refreshError, setRefreshError] = useState('')
  const refresh = async () => {
    try {
      setProfile(await connection.loadProfile())
      setRefreshError('')
    } catch (error) {
      setRefreshError(connection.actions.failureText(error))
    }
  }

  return (
    <>
      {refreshError && <p role="alert" className="academy-profile-error">{refreshError}</p>}
      <PrivateProfileView
        profile={profile}
        actions={connection.actions}
        name={profile.shareIdentity.state === 'ready' ? profile.shareIdentity.displayName : ''}
        refresh={refresh}
        setProfile={setProfile}
        back={{ href: '/dashboard', label: 'My learning' }}
      />
    </>
  )
}

export function AcademyProfileSurface({ connection }: { connection: Connection }) {
  const { locale } = useUi()
  const text = locale === 'th'
    ? {
        back: 'กลับไปที่คอร์สของฉัน',
        title: 'โปรไฟล์ทักษะ',
        heading: 'ยังไม่สามารถเปิดโปรไฟล์ทักษะได้',
        body: 'Academy ยังไม่สามารถโหลดโปรไฟล์ทักษะร่วมได้ ประวัติการเรียน Academy ของคุณยังอยู่เหมือนเดิม',
      }
    : {
        back: 'Back to My learning',
        title: 'Skills profile',
        heading: 'Your skills profile is not available yet',
        body: 'Academy could not load your shared skills profile. Your Academy learning record is unchanged.',
      }

  return (
    <AcademyProfileFrame>
      {connection.status === 'ready' ? <ConnectedProfile connection={connection} /> : (
        <div className="academy-profile-unavailable">
          <Link href="/dashboard" className="academy-profile-back">← {text.back}</Link>
          <p className="academy-profile-eyebrow">CYBERSKILLS Academy</p>
          <h1>{text.title}</h1>
          <section className="academy-profile-message" role="status" aria-labelledby="profile-unavailable-title">
            <h2 id="profile-unavailable-title">{text.heading}</h2>
            <p>{text.body}</p>
            <Link href="/dashboard">{text.back} →</Link>
          </section>
        </div>
      )}
    </AcademyProfileFrame>
  )
}

export function AcademySharedProfile({ share }: { share: SharedLearningProfile }) {
  return <AcademyProfileFrame><div className="academy-profile-share"><ProfileCard data={share} /></div></AcademyProfileFrame>
}
