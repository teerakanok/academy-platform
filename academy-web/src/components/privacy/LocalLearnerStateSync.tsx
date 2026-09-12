'use client'

import { useEffect } from 'react'
import { installLocalLearnerStateSync } from '@/lib/privacy/local-learner-state'

export function LocalLearnerStateSync() {
  useEffect(() => installLocalLearnerStateSync(), [])
  return null
}


