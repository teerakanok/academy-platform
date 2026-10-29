/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: b0e4e9db91d6c52e51f742a4a75ad220534150a0f0a0b787390937bd733eafdc */
import type { LearningJobLevel, LearningProfile, LearningSkill } from './types';
import { JourneyScene, sceneForRole, type JourneySceneId, type JourneySkin } from './JourneyScene';
import { ProfileIcon } from './ProfileIcon';
import './RoleJourney.css';

type Role = LearningProfile['roles'][number];
const stages: LearningJobLevel[] = ['entry', 'intermediate', 'advanced'];
const stageName = (level: LearningJobLevel) => level[0]!.toUpperCase() + level.slice(1);
const skillNames = ['Not assessed', 'Foundations', 'Applied', 'Independent', 'Advanced'];
const skillName = (level: number | null) => level === null ? 'Not assessed' : skillNames[level];

/** A milestone is reached only when every required skill is assessed at its target.
 * Stop at the first unmet milestone; strength elsewhere cannot move the learner past it. */
export function roleMilestones(role: Role, skills: LearningSkill[]) {
  const known = new Map(skills.map(skill => [skill.id, skill]));
  const milestones = stages.map(level => {
    const requirements = role.levels[level].requirements;
    const met = requirements.filter(item => {
      const actual = known.get(item.skillId)?.level;
      return actual != null && actual >= item.level;
    }).length;
    return { level, requirements, met, reached: requirements.length > 0 && met === requirements.length };
  });
  let reached = -1;
  for (let i = 0; i < milestones.length; i += 1) {
    if (!milestones[i]!.reached) break;
    reached = i;
  }
  return { milestones, reached, next: milestones[reached + 1]?.level ?? null };
}

export function AvatarPin({ initials }: { initials: string }) {
  return <svg viewBox="-22 -26 44 62" aria-hidden="true" className="rj-avatar-pin">
    <ellipse cy={29} rx={17} ry={4} className="rj-shadow" />
    <path className="rj-pin-body" d="m-9 10 9 17 9-17Z" />
    <circle className="rj-pin-body" cy={-3} r={19} />
    <text className="rj-pin-text" x={0} y={1} textAnchor="middle">{initials}</text>
  </svg>;
}

function SkillSteps({ requirements, skills }: {
  requirements: Role['levels']['entry']['requirements']; skills: LearningSkill[];
}) {
  const known = new Map(skills.map(skill => [skill.id, skill]));
  const position = (level: number) => `${12.5 + (level - 1) * 25}%`;
  return <details className="rj-details"><summary>Compare each skill</summary>
    <div className="rj-key"><span>Your level</span><span>Role target</span></div>
    <div className="rj-scale-head" aria-hidden="true"><div />
      <div className="rj-ruler">{[1, 2, 3, 4].map(level => <span key={level}>
        <b>{level}</b><span>{skillName(level)}</span>
      </span>)}</div>
    </div>
    {requirements.map(requirement => {
      const skill = known.get(requirement.skillId);
      const actual = skill?.level ?? null;
      const met = actual !== null && actual >= requirement.level;
      const label = skill?.label ?? requirement.skillId;
      const status = actual === null ? 'Not assessed' : actual < requirement.level ? 'Below target' : actual === requirement.level ? 'At target' : 'Above target';
      return <div className="rj-skill" key={requirement.skillId}>
        <div className="rj-skill-description"><strong>{label}</strong>
          <small className={met ? 'rj-met' : ''}>{met && <ProfileIcon name="check" />}{status}</small>
        </div>
        <div className="rj-skill-track" role="img" aria-label={`${label}: ${skillName(actual)}; role target ${skillName(requirement.level)}`}>
          <div className="rj-track-ticks" aria-hidden="true"><i /><i /><i /><i /></div>
          {actual !== null && <span className="rj-track-fill" style={{ width: `${(actual - 1) * 25}%` }} />}
          {actual !== requirement.level && <>
            <i className="rj-target-marker" style={{ left: position(requirement.level) }} />
            <span className={`rj-track-label rj-target-label rj-label-${requirement.level}`} style={{ left: position(requirement.level) }}>{skillName(requirement.level)}</span>
          </>}
          {actual !== null && <>
            <i className="rj-current-marker" style={{ left: position(actual) }} />
            <span className={`rj-track-label rj-current-label rj-label-${actual}`} style={{ left: position(actual) }}>{skillName(actual)}</span>
          </>}
        </div>
      </div>;
    })}
  </details>;
}

export function RoleJourney({ role, skills, selected, onSelect, displayName = '', scene = sceneForRole(role.id), skin = 'classic' }: {
  role: Role; skills: LearningSkill[]; selected: LearningJobLevel; onSelect: (level: LearningJobLevel) => void; displayName?: string; scene?: JourneySceneId; skin?: JourneySkin;
}) {
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toUpperCase() || '•';
  const { milestones, reached, next } = roleMilestones(role, skills);
  const active = milestones.find(item => item.level === selected)!;
  const known = new Map(skills.map(skill => [skill.id, skill]));
  const missing = active.requirements.filter(item => {
    const actual = known.get(item.skillId)?.level;
    return actual == null || actual < item.level;
  });
  const assessed = skills.some(skill => skill.level !== null);
  const current = reached >= 0 ? stageName(stages[reached]!) : assessed ? 'Working towards Entry' : 'Not assessed yet';
  return <div className="role-journey">
    <div className="rj-status"><span>Your current stage: <strong>{current}</strong></span>
      <span>{active.met} of {active.requirements.length} {stageName(selected)} skill targets met</span></div>
    <div className={`rj-map rj-stage-${reached + 1}`}>
      <JourneyScene scene={scene} skin={skin} className="rj-mountains rj-wide" />
      <JourneyScene scene={scene} skin={skin} narrow className="rj-mountains rj-narrow" />
      <svg className="rj-mobile-callout" viewBox="0 0 350 350" preserveAspectRatio="none" aria-hidden="true"><path d="M140 150H190l32 14M140 55H245l48 26" /><circle cx="222" cy="164" r="3" /><circle cx="293" cy="81" r="3" /></svg>
      <div className="rj-you"><span>You are here</span><AvatarPin initials={initials} /></div>
      <div className="rj-checkpoints" role="group" aria-label="Role milestones">{milestones.map(milestone =>
        <button key={milestone.level} type="button" className={`rj-checkpoint rj-${milestone.level}`}
          aria-label={`${stageName(milestone.level)}, ${milestone.met} of ${milestone.requirements.length} skills at target`}
          aria-pressed={selected === milestone.level} onClick={() => onSelect(milestone.level)}>
          <svg width="20" height="30" viewBox="0 0 20 30" aria-hidden="true"><path d="M2 29V2l16 5-16 5" /></svg>
          <strong>{stageName(milestone.level)}</strong><small>{milestone.met} of {milestone.requirements.length} skills</small>
        </button>)}
      </div>
    </div>
    <p className="rj-map-caption">{!assessed ? 'Your first assessment sets your starting point.' : next ? `Your next milestone is ${stageName(next)}.` : 'All three milestones reached.'} Choose a flag to compare its skill targets.</p>
    <div className="rj-next"><div><h3>{missing.length ? `To reach ${stageName(selected)}` : `${stageName(selected)} targets met`}</h3>
      <p>{missing.length ? `${missing.length} ${missing.length === 1 ? 'skill needs' : 'skills need'} further work.` : 'Each required skill meets the target.'}</p></div>
      <ul>{missing.map(item => <li key={item.skillId}><strong>{known.get(item.skillId)?.label ?? item.skillId}</strong>
        <span>{skillName(known.get(item.skillId)?.level ?? null)} → {skillName(item.level)}</span></li>)}</ul>
    </div>
    <SkillSteps requirements={active.requirements} skills={skills} />
  </div>;
}
