import type { SkillDatum } from './skills'

export type SkillMapState = 'idle' | 'loading' | 'ready' | 'unavailable'
export type SkillMapPresentation = 'hidden' | 'loading' | 'ready' | 'unavailable'

/** A learner map never renders on a public overview or after access becomes unconfirmed. */
export function skillMapPresentation({
  learnerRoute,
  state,
  coverage,
  accessConfirmed,
}: {
  learnerRoute: boolean
  state: SkillMapState
  coverage: SkillDatum[] | null
  accessConfirmed: boolean
}): SkillMapPresentation {
  if (!learnerRoute || !accessConfirmed) return 'hidden'
  if (state === 'loading') return 'loading'
  if (state === 'unavailable') return 'unavailable'
  return state === 'ready' && coverage ? 'ready' : 'hidden'
}
