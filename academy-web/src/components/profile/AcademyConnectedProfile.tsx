'use client'

import {
  createShareResponseSchema, privateProfileSchema, revokeShareResponseSchema,
  type CreateShareCommand, type PrivateProfile, type SetGoalCommand,
} from '@/core-profile-ui/contracts'
import { AcademyProfileSurface } from './AcademyProfileSurface'

async function selfRequest(body: unknown): Promise<unknown> {
  const response = await fetch('/api/profile/self', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('Profile service unavailable')
  return response.json()
}

export function AcademyConnectedProfile({ initialProfile }: { initialProfile: PrivateProfile }) {
  const loadProfile = async () => privateProfileSchema.parse(await selfRequest({ operation: 'profile' }))
  const actions = {
    async saveGoal(command: SetGoalCommand) {
      return privateProfileSchema.parse(await selfRequest({ operation: 'goal', command }))
    },
    async share(command: CreateShareCommand) {
      return createShareResponseSchema.parse(await selfRequest({ operation: 'share', command }))
    },
    async revoke(shareId: string, requestId: string) {
      return revokeShareResponseSchema.parse(await selfRequest({ operation: 'revoke', shareId, command: { requestId } }))
    },
    failureText: () => 'Unable to update your profile right now. Please try again.',
  }
  return <AcademyProfileSurface connection={{ status: 'ready', profile: initialProfile, actions, loadProfile }} />
}
