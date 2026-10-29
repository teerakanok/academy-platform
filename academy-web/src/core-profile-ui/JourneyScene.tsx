/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: a40c80f0312b694f7ee7ef46d11170ecff93861ffebacfa3061ead777422ca01 */
import type { SharePresentation } from './contracts';
import './JourneyScene.css';

export type JourneySceneId = SharePresentation['scene'];
export type JourneySkin = SharePresentation['theme'];

const ROLE_SCENES: Readonly<Record<string, JourneySceneId>> = {
  'soc-analyst': 'mountain', 'penetration-tester': 'canyon', pentester: 'canyon',
  'cloud-security-engineer': 'islands',
};
export const sceneForRole = (roleId: string | null | undefined): JourneySceneId => roleId ? ROLE_SCENES[roleId] ?? 'mountain' : 'mountain';

/** Scene geometry is presentation only. Milestones and skill levels come from Core. */
export function JourneyScene({ scene, skin, narrow = false, className = '' }: {
  scene: JourneySceneId; skin: JourneySkin; narrow?: boolean; className?: string;
}) {
  const dark = skin === 'halloween';
  return <svg className={`journey-scene scene-${scene} skin-${skin} ${className}`} viewBox={narrow ? '0 0 350 350' : '0 0 1128 350'} preserveAspectRatio="none" aria-hidden="true">
    {narrow ? <>
      <path className="scene-back" d="M0 350V222l61-34 51 21 93-102 35 27 53-70 57 41v245Z" />
      <path className="scene-mid" d="m42 350 92-110 49 33 88-129 79 56v150Z" />
      <path className="scene-trail-base" d="M47 308C115 300 82 254 158 237S170 164 222 164 242 97 293 81" />
      <path className="scene-trail" d="M47 308C115 300 82 254 158 237S170 164 222 164 242 97 293 81" />
      {dark && <path className="scene-lava" d="m263 59 12-21 10 10 9-18 12 31" />}
    </> : <>
      {scene === 'islands' && !dark ? <>
        <path className="scene-water" d="M0 0h1128v350H0Z" />
        <path className="scene-ripples" d="M0 255Q140 225 250 270T530 252 800 220 1128 270M0 300Q150 270 310 305T660 295 1128 305" />
        <path className="scene-mid" d="M15 350q45-115 160-115l80 35q30 90 170 80Zm250-110q70-90 170-65l110 50q25 50-120 60Zm285-60q30-85 160-75l100 50q10 65-105 65Zm240-65q30-95 145-85l150 80q20 75-115 65Z" />
        <path className="scene-front" d="m120 290 22-25 24 25m458-130 20-25 25 25m259-65 20-28 25 28" />
      </> : scene === 'canyon' && !dark ? <>
        <path className="scene-back" d="M0 350V200l110 5 22-44 60 8 17 45 76 3 38-74h70l20-38h67l37 77 90-9 26-92 68 2 18-42 84 3 37 78 70-5 21-63 82 4 12 76 108 30V350Z" />
        <path className="scene-mid" d="M0 350V277l210-20 50 35 160-90 142 9 85-72 120 29 115-76 100 51 146 28v179Z" />
        <path className="scene-front" d="M0 350h1128v-90l-169-70-136 42-80-32-120 81-170-7-127 68-110-18Z" />
        <path className="scene-strata" d="M12 229h87m47-31h42m152-35h65m240-60h62m160 18h75" />
      </> : <>
        <path className="scene-back" d="M0 339 165 237 245 257 421 137 522 187 722 66 807 111 956 20 1128 194V350H0Z" />
        <path className="scene-mid" d="m167 350 251-170 112 59 203-127 65 50L956 69l172 166v115Z" />
        <path className="scene-front" d="m580 350 156-148 69 33L952 122l176 139v89Z" />
      </>}
      {dark ? <>
        <circle className="scene-moon" cx={200} cy={52} r={19} /><circle className="scene-moon-cut" cx={207} cy={45} r={17} />
        <path className="scene-lava" d="m846 110 13-33 10 15 8-23 18 42m-37-38 5-38 8 10 7-29 10 61" />
        <path className="scene-tower" d="M932 45V12h8V1l8 11v34h8V20l7-10 7 10v37" />
        <path className="scene-birds" d="m315 85 8-4 8 4m-6-3 4-6 4 6m37-18 7-4 8 4" />
        <path className="scene-lava-faint" d="m960 66 18 45 30 34-29-6 9 35-28-31-14 9 8-40Z" />
      </> : <>
        {scene === 'mountain' && <path className="scene-snow" d="m401 150 20-13 25 18-20-4-7 6-9-8Zm304-70 17-14 23 12-18-4-7 6-6-4Zm232-46 19-14 22 23-20-9-9 5Z" />}
        <path className="scene-birds" d="m610 59 8-4 8 4m-3-8 7-4 7 4" />
        {[[165,270],[208,265],[456,281],[552,239],[753,213],[1008,184]].map(([x,y], index) => <g key={index} transform={`translate(${x} ${y})`} className="scene-tree">
          <ellipse cy={13} rx={12} ry={3} opacity={0.15} /><path d="M-1 4h2v11h-2Z" /><path d="M0-14-8 3h16Zm0 7-10 15h20Z" />
        </g>)}
      </>}
      <path className="scene-trail-base" d="M104 305C198 310 213 250 355 246S494 256 613 171 760 157 863 81" />
      <path className="scene-trail" d="M104 305C198 310 213 250 355 246S494 256 613 171 760 157 863 81" />
      {dark ? <path className="scene-lava-line" d="M850 107q65 22 115 67t140 80" /> : <g transform="translate(267 300)" className="scene-camp">
        <path d="m-14 0 14-17 14 17Z" /><path d="M0-17V0h14Z" className="scene-camp-side" /><path d="m0-7-5 7H5Z" className="scene-camp-door" />
      </g>}
    </>}
  </svg>;
}
