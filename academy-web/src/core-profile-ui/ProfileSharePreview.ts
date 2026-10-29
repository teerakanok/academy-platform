/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: 1beb167512cd3b119f1c4f61767e3eb6f17d5fcec149bd794235887877a68e48 */
import type { LearningProfile, LearningSharePresentation } from './types';
import type { ProfileCardData } from './ProfileCard';

/** Local preview of the same public fields Core will freeze. No history, principal,
 * account email or source reference crosses into the shared card. */
export function profileSharePreview(profile: LearningProfile, options: {
  displayName: string; skillIds: string[]; includeRoleComparison: boolean; presentation: LearningSharePresentation;
}): ProfileCardData {
  const selected = new Set(options.skillIds);
  const skills = profile.skills.filter(skill => selected.has(skill.id));
  const used = new Set(skills.flatMap(skill => skill.evidenceIds));
  const evidence = profile.evidence.filter(item => used.has(item.id) && item.status === 'eligible');
  const ids = new Map(evidence.map((item,index) => [item.id,`preview-result-${index+1}`]));
  const role = options.includeRoleComparison ? profile.roles.find(item => item.id === profile.goal.roleId) : undefined;
  const required = new Set(role ? Object.values(role.levels).flatMap(level => level.requirements.map(item => item.skillId)) : []);
  return {
    displayName: options.displayName.trim(), interpretation: profile.interpretation,
    presentation: options.presentation,
    skills: skills.map(skill => ({...skill,evidenceIds:skill.evidenceIds.flatMap(id => ids.has(id) ? [ids.get(id)!] : [])})),
    evidence: evidence.map(item => ({...item,id:ids.get(item.id)!,verificationReference:null,skillIds:item.skillIds.filter(id => selected.has(id))})),
    roleComparison: role ? {
      roleId:role.id,title:role.title,level:profile.goal.level,
      requirements:role.levels[profile.goal.level].requirements.filter(item => selected.has(item.skillId)),
      journey:{role,skillLabels:profile.skills.filter(skill => required.has(skill.id)).map(({id,label}) => ({id,label}))},
    } : null,
  };
}
