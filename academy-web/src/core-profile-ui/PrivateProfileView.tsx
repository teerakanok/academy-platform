/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: 402f6ab450dcc58efedf7feafeda941220702dac59a8e8099bf1e4018d5289d3 */
import { useEffect, useRef, useState } from 'react';
import type { LearningProfile, LearningSkill, LearningEvidence, LearningJobLevel, ProfileActions } from './types';
import { SkillRadar } from './SkillRadar';
import { RoleJourney } from './RoleJourney';
import { ProfileChoice, ProfileSegments } from './ProfileControls';
import { ProfileCard } from './ProfileCard';
import { profileSharePreview } from './ProfileSharePreview';
import { JourneyScene, sceneForRole, type JourneySceneId, type JourneySkin } from './JourneyScene';
import { ProfileIcon } from './ProfileIcon';
import './LearningProfileScreen.css';
const LEVELS = ['Not assessed', 'Foundations', 'Applied', 'Independent', 'Advanced'];
const PRODUCT_LABELS: Record<string, string> = {
  crux: 'Crux', academy: 'Academy', star: 'STAR', angler: 'Angler', phalanx: 'PhalanX', forge: 'Forge',
};
const KIND_LABELS: Record<string, string> = {
  lab: 'Lab', module: 'Assessment', quiz: 'Quiz', ctf: 'CTF', challenge: 'Challenge', practice: 'Practice', simulation: 'Exercise',
  verified_assessment: 'Assessment', verified_lab_outcome: 'Practical assessment',
  behavior_observed: 'Observed behaviour', team_context: 'Team participation', ai_practice: 'AI-guided practice',
};
const levelLabel = (value: number | null) => value === null ? 'Not assessed' : LEVELS[value] ?? 'Not assessed';
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-GB', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
}).format(new Date(value));
function EvidenceTable({ evidence }: { evidence: LearningEvidence[] }) {
  if (evidence.length === 0) return <p className="lp-empty">No results yet.</p>;
  return <>
    <p className="lp-scroll-hint">Scroll the table to see the assessment details →</p>
    <div className="lp-table-scroll" role="region" aria-label="Assessment results" tabIndex={0}>
      <table className="lp-evidence-table"><thead><tr>
        <th scope="col">Activity</th><th scope="col">Product</th><th scope="col">Result</th><th scope="col">Assessed · UTC</th>
      </tr></thead><tbody>{evidence.map(item => <tr key={item.id}>
        <td><strong>{item.title}</strong>{item.verificationReference && <details>
          <summary>Assessment reference</summary><p className="lp-reference">{item.verificationReference}</p>
          <p className="lp-note">Issued by {PRODUCT_LABELS[item.product] ?? item.product}. This reference identifies the assessment record.</p>
        </details>}</td>
        <td>{PRODUCT_LABELS[item.product] ?? item.product}<small>{KIND_LABELS[item.kind] ?? item.kind.replaceAll('_', ' ')}</small></td>
        <td>{item.status === 'eligible' ? 'Counts towards your skills' : item.status === 'unmapped'
          ? 'Skill not assigned yet' : item.status === 'practice' ? 'Practice' : 'Not counted towards skills'}
          {item.attribution === 'team' && <small>Team result</small>}</td>
        <td><time dateTime={item.assessedAt}>{dateLabel(item.assessedAt)}</time></td>
      </tr>)}</tbody></table>
    </div>
  </>;
}

function SkillList({ skills, numbered = false }: { skills: LearningSkill[]; numbered?: boolean }) {
  return <ul className="lp-skill-list">{skills.map((skill, index) => <li key={skill.id}>
    <span><strong>{numbered && <span className="lp-skill-number" aria-hidden="true">{index + 1}. </span>}{skill.label}</strong><small>{skill.assessedAt ? `Last assessed ${dateLabel(skill.assessedAt)}` : 'Not assessed yet'}</small></span>
    <span className="lp-level">{levelLabel(skill.level)}</span>
  </li>)}</ul>;
}

function SharingControls({ profile, actions, onUpdate }: {
  profile: LearningProfile; actions: ProfileActions; onUpdate: () => Promise<void>;
}) {
  const eligible = profile.skills.filter(skill => skill.level !== null && skill.evidenceIds.length > 0);
  const identityReady = profile.shareIdentity.state === 'ready';
  const displayName = profile.shareIdentity.displayName ?? '';
  const savedRole = profile.roles.find(role => role.id === profile.goal.roleId);
  const roleSkills = new Set(savedRole ? Object.values(savedRole.levels).flatMap(stage => stage.requirements.map(item => item.skillId)) : []);
  const unassessedRoleSkills = [...roleSkills].filter(id => !eligible.some(skill => skill.id === id)).length;
  const [selected, setSelected] = useState(() => new Set<string>());
  const [includeRole, setIncludeRole] = useState(false);
  const [expires, setExpires] = useState(30);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [newLink, setNewLink] = useState('');
  const [createdSignature, setCreatedSignature] = useState('');
  const [sceneOverride, setSceneOverride] = useState<JourneySceneId | null>(null);
  const [skin, setSkin] = useState<JourneySkin>('classic');
  const [showRadar, setShowRadar] = useState(true);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const pending = useRef<{ signature: string; requestId: string; secret: string } | null>(null);
  const revocations = useRef(new Map<string, string>());
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const selectedIds = eligible.filter(skill => selected.has(skill.id)).map(skill => skill.id).sort();
  const hasGoal = profile.goal.roleId !== null;
  const scene = sceneOverride ?? sceneForRole(profile.goal.roleId);
  const presentation = { scene, theme: skin, showRadar };
  const body = { skillIds: selectedIds, includeRoleComparison: includeRole && hasGoal, expiresInDays: expires, presentation };
  const signature = JSON.stringify(body);
  const preview = profileSharePreview(profile, {...body, displayName: displayName.trim()});

  const create = async () => {
    if (busy || !identityReady || selectedIds.length === 0 || selectedIds.length > 32) return;
    if (pending.current?.signature !== signature) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      pending.current = { signature, requestId: crypto.randomUUID(), secret: [...bytes].map(value => value.toString(16).padStart(2, '0')).join('') };
    }
    const command = pending.current;
    setBusy(true); setNotice('');
    try {
      const result = await actions.share({ ...body, requestId: command.requestId, secret: command.secret });
      if (!live.current) return;
      setNewLink(`${window.location.origin}/profile/share/${encodeURIComponent(result.share.id)}#${command.secret}`);
      pending.current = null; setCreatedSignature(signature);
      setNotice('Link created. Copy it before leaving this page; you can revoke it later.');
      await onUpdate();
    } catch (cause) { if (live.current) setNotice(actions.failureText(cause)); }
    finally { if (live.current) setBusy(false); }
  };
  const revoke = async (id: string) => {
    if (busy) return;
    const requestId = revocations.current.get(id) ?? crypto.randomUUID();
    revocations.current.set(id, requestId); setBusy(true); setNotice('');
    try {
      await actions.revoke(id, requestId);
      revocations.current.delete(id);
      if (!live.current) return;
      if (newLink.includes(`/profile/share/${encodeURIComponent(id)}#`)) setNewLink('');
      setNotice('Sharing revoked. The link no longer opens the profile.');
      await onUpdate();
    } catch (cause) { if (live.current) setNotice(actions.failureText(cause)); }
    finally { if (live.current) setBusy(false); }
  };
  return <section className="lp-pane lp-sharing" id="lp-share" aria-labelledby="lp-sharing-title">
    <h2 id="lp-sharing-title">Share your skills</h2>
    <p className="lp-note">Choose what to share. Your learning history stays private. If you include a role comparison, it will cover only the skills you select.</p>
    {eligible.length === 0 ? <p className="lp-empty">Complete an assessment to add skills you can share.</p> : <div className="lp-share-editor">
      <div className="lp-share-options"><fieldset disabled={busy}>
        <legend>Share settings</legend>
        <div className="lp-share-identity"><span className="profile-control-label">Profile owner</span><strong><ProfileIcon name="lock" />{displayName || 'CYBERSKILLS account name'}</strong><small>{identityReady ? 'From your CYBERSKILLS account' : 'Name currently unavailable'}</small></div>
        {!identityReady && <p className="lp-share-unavailable" role="status">{profile.shareIdentity.state === 'name_missing' ? 'Add your name in your CYBERSKILLS account before creating a share link.' : 'Your account name could not be loaded. Refresh your profile before creating a share link.'}</p>}
        {eligible.length > 32 && <p className="lp-note">Choose up to 32 skills for one share link.</p>}
        <div className="lp-share-skills">{eligible.map(skill => <label key={skill.id}><input type="checkbox" checked={selected.has(skill.id)} disabled={!selected.has(skill.id) && selectedIds.length >= 32} onChange={event => {
          const next = new Set(selected); if (event.target.checked) next.add(skill.id); else next.delete(skill.id); setSelected(next);
        }} />{skill.label}</label>)}</div>
        <div className="lp-share-divider"><label className="lp-check"><input type="checkbox" checked={includeRole} disabled={!hasGoal} onChange={event => setIncludeRole(event.target.checked)} />Include my saved role comparison{hasGoal && ` · ${profile.roles.find(role => role.id === profile.goal.roleId)?.title ?? 'Role'} · ${profile.goal.level[0]!.toUpperCase()+profile.goal.level.slice(1)}`}</label>
          {includeRole && <p className="lp-share-role-note">Your overall stage appears when all {roleSkills.size} role skills are shared.{unassessedRoleSkills > 0 && ` ${unassessedRoleSkills} ${unassessedRoleSkills === 1 ? 'has' : 'have'} not been assessed yet.`}</p>}
          <label className="lp-check"><input type="checkbox" checked={showRadar} onChange={event => setShowRadar(event.target.checked)} />Show skills chart</label></div>
        <div className="lp-share-divider"><span className="profile-control-label">Journey</span><div className="lp-scene-options" role="group" aria-label="Journey scene">
          {([{id:'mountain',label:'Mountain trail'},{id:'canyon',label:'Red canyon'},{id:'islands',label:'Island route'}] as const).map(option => <button key={option.id} type="button" aria-label={option.label} aria-pressed={scene === option.id} onClick={() => setSceneOverride(option.id)}>
            <JourneyScene scene={option.id} skin="classic" /><span>{option.label}</span></button>)}
        </div></div>
        <div className="lp-share-divider"><span className="profile-control-label">Theme</span><div className="lp-theme-options" role="group" aria-label="Share theme">
          {([{id:'classic',label:'Classic'},{id:'halloween',label:'Halloween'}] as const).map(option => <button key={option.id} type="button" aria-pressed={skin === option.id} aria-label={option.label} onClick={() => setSkin(option.id)}>
            <JourneyScene scene={scene} skin={option.id} /><span>{option.label}</span></button>)}
        </div></div>
        <div className="lp-field"><span>Link expires in</span><ProfileSegments label="Link expires in" value={String(expires)} disabled={busy}
          options={[7, 30, 90].map(days => ({value: String(days), label: `${days} days`}))} onChange={value => setExpires(Number(value))} /></div>
        <button className="btn primary" type="button" disabled={selectedIds.length === 0 || selectedIds.length > 32 || !identityReady} onClick={() => void create()}><ProfileIcon name="share" />{busy ? 'Creating…' : 'Create share link'}</button>
      </fieldset>
      {notice && <p className="lp-notice" role="status">{notice}</p>}
      {newLink && <div className="lp-link-result"><label className="lp-field">Your share link<input readOnly value={newLink} onFocus={event => event.currentTarget.select()} /></label>
        {signature !== createdSignature && <p className="lp-note">Options changed. Create a new link to share this preview.</p>}
        <button type="button" className="btn sm" onClick={() => {
          if (!navigator.clipboard) { setNotice('Select the link above and copy it.'); return; }
          void navigator.clipboard.writeText(newLink).then(() => setNotice('Link copied.')).catch(() => setNotice('Select the link above and copy it.'));
        }}><ProfileIcon name="copy" />Copy link</button><a className="btn sm" href={newLink} target="_blank" rel="noopener noreferrer"><ProfileIcon name="open" />Open shared profile</a>
      </div>}
      </div>
      <aside className={`lp-share-preview${previewExpanded ? ' lp-preview-expanded' : ''}`} aria-label="Shared profile preview"><div className="lp-preview-label"><span>Live preview</span><span>What others will see</span></div><button type="button" className="lp-preview-toggle" aria-expanded={previewExpanded} onClick={() => setPreviewExpanded(value => !value)}><ProfileIcon name="share" /><span>{previewExpanded ? 'Hide preview' : 'Preview your shared profile'}</span><span aria-hidden="true">{previewExpanded ? '−' : '+'}</span></button><div className="lp-preview-content"><ProfileCard data={preview} preview /></div></aside>
    </div>}
    {profile.shares.length > 0 && <div className="lp-links"><h3>Links you created</h3>{profile.shares.map(share => <div className="lp-link-row" key={share.id}>
      <span>{share.skillIds.length} {share.skillIds.length === 1 ? 'skill' : 'skills'} · created {dateLabel(share.createdAt)}<small>{share.revokedAt ? 'Revoked' : share.invalidReason === 'name_unverified' ? 'Older name format · link unavailable' : new Date(share.expiresAt) <= new Date(profile.asOf) ? 'Expired' : `Expires ${dateLabel(share.expiresAt)}`}</small></span>
      {!share.revokedAt && new Date(share.expiresAt) > new Date(profile.asOf) && <button type="button" className="btn sm" disabled={busy} onClick={() => void revoke(share.id)}>Revoke link</button>}
    </div>)}</div>}
  </section>;
}

export function PrivateProfileView({ profile, actions, name, refresh, setProfile, back }: {
  profile: LearningProfile; actions: ProfileActions; name: string; back: { href: string; label: string }; refresh: () => Promise<void>;
  setProfile: (view: LearningProfile) => void;
}) {
  const [historyMonths, setHistoryMonths] = useState('3');
  const [roleId, setRoleId] = useState(profile.goal.roleId ?? profile.roles[0]?.id ?? '');
  const [jobLevel, setJobLevel] = useState<LearningJobLevel>(profile.goal.level);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalNotice, setGoalNotice] = useState('');
  const goalCommand = useRef<{ signature: string; id: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const role = profile.roles.find(item => item.id === roleId);
  const comparison = profile.history.find(item => String(item.monthsAgo) === historyMonths);
  const sources = [...new Set(profile.evidence.map(item => item.product))];
  const saveGoal = async () => {
    if (!role || goalBusy) return;
    const signature = JSON.stringify([roleId, jobLevel]);
    if (goalCommand.current?.signature !== signature) goalCommand.current = { signature, id: crypto.randomUUID() };
    setGoalBusy(true); setGoalNotice('');
    try {
      const result = await actions.saveGoal({ requestId: goalCommand.current.id, roleId, level: jobLevel });
      if (!alive.current) return;
      setProfile(result); goalCommand.current = null; setGoalNotice('Target saved.');
    } catch (cause) { if (alive.current) setGoalNotice(actions.failureText(cause)); }
    finally { if (alive.current) setGoalBusy(false); }
  };
  const recent = [...profile.evidence].sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)).slice(0, 4);
  return <div className="learning-profile">
    <a className="page-back" href={back.href}>← {back.label}</a>
    <header className="lp-header"><div><p className="lp-eyebrow">Skills profile</p><h1>{name || 'My profile'}</h1></div>
      <div className="lp-header-actions"><button type="button" className="btn sm lp-icon-button" aria-label="Refresh profile" title="Refresh profile" onClick={() => void refresh()}><ProfileIcon name="refresh" /></button>
        <a className="btn primary" href="#lp-share"><ProfileIcon name="share" />Share profile</a></div></header>
    <section className="lp-pane lp-role" aria-labelledby="lp-role-title">
      <div className="lp-role-heading"><div id="lp-role-title"><ProfileChoice prominent label="Your role goal" value={roleId}
        options={profile.roles.map(item => ({value:item.id,label:item.title}))} disabled={goalBusy}
        onChange={value => { setRoleId(value); setGoalNotice(''); }} /></div>
        {role && <button className="btn sm" type="button" disabled={goalBusy || (profile.goal.roleId === roleId && profile.goal.level === jobLevel)} onClick={() => void saveGoal()}>{goalBusy ? 'Saving…' : 'Save target'}</button>}
      </div>
      {role ? <RoleJourney role={role} skills={profile.skills} selected={jobLevel} displayName={name}
        onSelect={level => { if (!goalBusy) { setJobLevel(level); setGoalNotice(''); } }} />
        : <p className="lp-empty">Role comparisons are not available yet.</p>}
      {goalNotice && <p role="status" className="lp-notice">{goalNotice}</p>}
      <p className="lp-role-rubric">Role levels use {profile.interpretation.label} · {profile.interpretation.version}</p>
    </section>
    <div className="lp-overview lp-overview-below">
      <section className="lp-skills"><div className="lp-heading"><h2>Your current skills</h2>
        <ProfileSegments label="Compare your skills over time" value={historyMonths} onChange={setHistoryMonths}
          options={[...[3,6,9,12].map(months=>({value:String(months),label:`${months}m`,accessibleLabel:`${months} months ago`})),{value:'none',label:'Now',accessibleLabel:'Current skills only'}]} /></div>
        <SkillRadar skills={profile.skills} history={comparison?.skills} historyLabel={comparison ? `${comparison.monthsAgo} months ago` : null} />
        <details className="lp-all-levels"><summary>View skill levels</summary><SkillList skills={profile.skills} numbered /></details>
        <p className="lp-note">{sources.length ? `Results from ${sources.map(source => PRODUCT_LABELS[source] ?? source).join(' · ')}.` : 'No assessment results have been added yet.'}</p>
      </section>
      <section className="lp-recent"><h2>Recent results</h2>{recent.length === 0 ? <p className="lp-empty">Your results will appear here after an assessment.</p> : <ul>
        {recent.map(item => <li key={item.id}><div><strong>{item.title}</strong><small>{PRODUCT_LABELS[item.product] ?? item.product} · {item.status === 'eligible' ? 'Assessed' : item.status === 'practice' ? 'Practice' : item.status === 'unmapped' ? 'Skill not assigned yet' : 'Not counted towards skills'}</small></div>
          <time dateTime={item.assessedAt}>{dateLabel(item.assessedAt)}</time></li>)}
      </ul>}<a href="#lp-results">View all results <ProfileIcon name="arrow" /></a></section>
    </div>
    <section className="lp-pane lp-evidence" id="lp-results"><h2>Your learning record</h2><p className="lp-note">Assessment dates are shown in UTC. TA and testing work do not add skill levels.</p>
      <EvidenceTable evidence={profile.evidence} /></section>
    <SharingControls profile={profile} actions={actions} onUpdate={refresh} />
    <p className="lp-footer">Historical charts use results assessed by that date and the current CYBERSKILLS rubric. Unassessed skills are left blank.</p>
  </div>;
}
