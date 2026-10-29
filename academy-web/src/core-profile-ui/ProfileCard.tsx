/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: 2d987f9d8123dee8a8f4aa596794c5b72ef806b578f093cce521a12031c16fe0 */
import type { LearningSkill, SharedLearningProfile } from './types';
import { DEFAULT_SHARE_PRESENTATION } from './contracts';
import { JourneyScene } from './JourneyScene';
import { AvatarPin, roleMilestones } from './RoleJourney';
import { SkillRadar } from './SkillRadar';
import './ProfileCard.css';

export type ProfileCardData = Pick<SharedLearningProfile, 'displayName' | 'interpretation' | 'skills' | 'evidence' | 'roleComparison' | 'presentation'>;
const STAGES = ['entry', 'intermediate', 'advanced'] as const;
const levelNames = ['Not assessed', 'Foundations', 'Applied', 'Independent', 'Advanced'];
const products: Record<string,string> = {crux:'Crux',academy:'Academy',star:'STAR',angler:'Angler',phalanx:'PhalanX',forge:'Forge'};
const title = (value: string) => value[0]!.toUpperCase() + value.slice(1);
const date = (value: string) => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));

/** Used unchanged by the public page and the owner's live preview. It receives only
 * the public projection; private history and account fields are never inputs. */
export function ProfileCard({ data, preview = false }: { data: ProfileCardData; preview?: boolean }) {
  const Heading = preview ? 'h3' : 'h1';
  const Subheading = preview ? 'h4' : 'h2';
  const presentation = data.presentation ?? DEFAULT_SHARE_PRESENTATION;
  const comparison = data.roleComparison;
  const journey = comparison?.journey;
  const records = new Map(data.evidence.map(item => [item.id,item]));
  const known = new Map(data.skills.map(skill => [skill.id,skill]));
  const labels = new Map(journey?.skillLabels.map(skill => [skill.id,skill.label]));
  const required = new Set(journey ? STAGES.flatMap(stage => journey.role.levels[stage].requirements.map(item => item.skillId)) : []);
  const allShared = journey !== undefined && [...required].every(id => known.has(id));
  const sharedSkills: LearningSkill[] = [...required].map(id => known.get(id) ?? {id,label:labels.get(id) ?? id,level:null,evidenceIds:[],assessedAt:null});
  const milestones = journey ? roleMilestones(journey.role,sharedSkills) : null;
  const target = milestones?.milestones.find(item => item.level === comparison?.level);
  const initials = data.displayName.trim().split(/\s+/).slice(0,2).map(part => [...part][0] ?? '').join('').toUpperCase() || '•';
  const scope = !allShared ? 'Shared role comparison' : target ? `${target.met} of ${target.requirements.length} ${title(target.level)} targets met` : 'Shared skills';
  return <article className={`profile-card profile-card-${presentation.theme}`}>
    <header className="profile-card-header"><span className="profile-card-brand">CYBERSKILLS</span>
      <Heading>{data.displayName || 'Your name'}</Heading><p>{comparison ? `Target role: ${comparison.title} · ${title(comparison.level)}` : 'Skills profile'}</p>
    </header>
    {comparison && <><div className={`profile-card-map profile-card-stage-${(milestones?.reached ?? -1)+1}`}>
      <JourneyScene scene={presentation.scene} skin={presentation.theme} />
      {journey && <div className="profile-card-flags" aria-hidden="true">{STAGES.map(stage => <span key={stage} className={`profile-card-flag-${stage}`}>{title(stage)}</span>)}</div>}
      {allShared && <div className="profile-card-you"><span>Current stage</span><AvatarPin initials={initials} /></div>}
    </div>
      <p className={`profile-card-scope${allShared ? ' profile-card-scope-full' : ''}`}><strong>{scope}</strong>{!allShared && <small>{data.skills.length} {data.skills.length === 1 ? 'skill' : 'skills'} shared · overall role stage not shown</small>}</p>
    </>}
    <section className="profile-card-skills"><Subheading>Skills</Subheading>
      {presentation.showRadar && data.skills.length >= 3 && <SkillRadar skills={data.skills} history={undefined} historyLabel={null} currentLabel="Skills shared" />}
      {data.skills.length ? <ul>{data.skills.map(skill => <li key={skill.id}><strong>{skill.label}</strong><small>{skill.level === null ? 'Not assessed' : levelNames[skill.level]}{[...new Set(skill.evidenceIds.flatMap(id => {const record=records.get(id);return record ? [products[record.product] ?? record.product] : [];}))].map(product => <span className="profile-card-product" key={product}>{product}</span>)}</small></li>)}</ul>
        : <p className="lp-empty">Choose a skill to preview it here.</p>}
    </section>
    {data.evidence.length > 0 && <section className="profile-card-results"><Subheading>Assessment results</Subheading><ul>{data.evidence.map(item => <li key={item.id}>
      <strong>{item.title}</strong><small>{products[item.product] ?? item.product} · {date(item.assessedAt)}{item.attribution === 'team' ? ' · Team result' : ''}</small>
    </li>)}</ul></section>}
    <footer className="profile-card-footer"><span>CYBERSKILLS interpretation</span><span>{data.interpretation.version}</span></footer>
  </article>;
}
