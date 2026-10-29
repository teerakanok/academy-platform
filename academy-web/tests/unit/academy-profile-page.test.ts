import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, redirect, createCoreHostClient, profile } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  redirect: vi.fn(() => { throw new Error('redirect') }),
  createCoreHostClient: vi.fn(),
  profile: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/profile/core-host-client', () => ({ createCoreHostClient }))
vi.mock('@/components/profile/AcademyProfileSurface', () => ({ AcademyProfileSurface: () => null }))
vi.mock('@/components/profile/AcademyConnectedProfile', () => ({ AcademyConnectedProfile: () => null }))

import ProfilePage, { metadata } from '@/app/(site)/profile/page'

vi.stubGlobal('React', React)

describe('profile page', () => {
  beforeEach(() => { vi.clearAllMocks(); createCoreHostClient.mockReturnValue(null) })

  it('uses the authoritative Academy session and exposes only the unavailable state', async () => {
    currentUser.mockResolvedValue({ account: { id: 'synthetic-user' }, email: 'synthetic@example.test' })
    const page = await ProfilePage()
    expect(currentUser).toHaveBeenCalledTimes(1)
    expect(page.props.connection).toEqual({ status: 'unavailable' })
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('redirects when no authoritative session exists', async () => {
    currentUser.mockResolvedValue(null)
    await expect(ProfilePage()).rejects.toThrow('redirect')
    expect(redirect).toHaveBeenCalledWith('/sign-in?next=%2Fprofile')
  })

  it('loads only the active session principal when configured', async () => {
    const account = { issuer: 'https://accounts.example.test/', subject: 'synthetic-learner' }
    currentUser.mockResolvedValue({ account })
    createCoreHostClient.mockReturnValue({ profile })
    profile.mockResolvedValue({ synthetic: true })
    const page = await ProfilePage()
    expect(profile).toHaveBeenCalledWith(account)
    expect(page.props.initialProfile).toEqual({ synthetic: true })
  })

  it('shows unavailable when Core cannot read the profile', async () => {
    currentUser.mockResolvedValue({ account: { issuer: 'https://accounts.example.test/', subject: 'synthetic-learner' } })
    createCoreHostClient.mockReturnValue({ profile })
    profile.mockRejectedValue(new Error('unavailable'))
    const page = await ProfilePage()
    expect(page.props.connection).toEqual({ status: 'unavailable' })
  })
})
