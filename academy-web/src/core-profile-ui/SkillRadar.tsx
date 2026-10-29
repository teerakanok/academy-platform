/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: 749e09c65c420d2172aa46ba0d983e34fd79e7aac8caabaf589b296bd3985406 */
import { useId } from 'react';
import type { LearningSkill } from './types';

const point = (index: number, count: number, value: number) => {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
  return { x: 240 + Math.cos(angle) * value * 27, y: 165 + Math.sin(angle) * value * 27 };
};

export function SkillRadar({ skills, history, historyLabel, currentLabel = 'Your current skills' }: {
  skills: LearningSkill[];
  history: { id: string; level: number | null }[] | undefined;
  historyLabel: string | null;
  currentLabel?: string;
}) {
  const titleId = useId();
  if (skills.length < 3) return <p className="lp-empty">Your skill map appears once at least three skill areas are defined.</p>;
  const previous = new Map(history?.map(item => [item.id, item.level]));
  const layers = [
    { name: currentLabel, values: skills.map(item => item.level), className: 'lp-radar-current' },
    ...(history ? [{ name: historyLabel ?? 'Earlier skills', values: skills.map(item => previous.get(item.id) ?? null), className: 'lp-radar-past' }] : []),
  ];
  const description = skills.map(item => `${item.label}: ${item.level === null ? 'not assessed' : `${item.level} of 4`}`).join('; ')
    + (historyLabel ? `. Comparison: ${historyLabel}` : '');
  return <figure className="lp-radar">
    <svg viewBox="0 0 480 340" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{description}</title>
      {[1, 2, 3, 4].map(value => <polygon key={value} className="lp-radar-grid"
        points={skills.map((_, index) => { const p = point(index, skills.length, value); return `${p.x},${p.y}`; }).join(' ')} />)}
      {[1,2,3,4].map(value => <text className="lp-radar-ring-number" key={`ring-${value}`} x={245} y={165-value*27-3} aria-hidden="true">{value}</text>)}
      {skills.map((item, index) => {
        const end = point(index, skills.length, 4);
        const label = point(index, skills.length, 5.25);
        const words = item.label.split(' ');
        const middle = Math.ceil(words.length / 2);
        const lines = words.length > 1 ? [words.slice(0, middle).join(' '), words.slice(middle).join(' ')] : [item.label];
        return <g key={item.id}><line className="lp-radar-grid" x1={240} y1={165} x2={end.x} y2={end.y} />
          <text className="lp-radar-axis-name" x={label.x} y={label.y} textAnchor={label.x > 255 ? 'start' : label.x < 225 ? 'end' : 'middle'}>
            {lines.map((text, line) => <tspan key={line} x={label.x} dy={line === 0 ? 0 : '1.2em'}>{text}</tspan>)}
          </text><text className="lp-radar-axis-number" aria-hidden="true" x={label.x} y={label.y} textAnchor="middle">{index + 1}</text></g>;
      })}
      {layers.map(layer => <g key={layer.name} className={layer.className}>
        {layer.values.every(value => value !== null) && <polygon points={layer.values.map((value, index) => {
          const p = point(index, skills.length, value ?? 0); return `${p.x},${p.y}`;
        }).join(' ')} />}
        {layer.values.map((value, index) => {
          if (value === null) return null;
          const p = point(index, skills.length, value);
          const next = layer.values[(index + 1) % skills.length];
          const end = next == null ? null : point((index + 1) % skills.length, skills.length, next);
          return <g key={skills[index]?.id ?? index}>
            {!layer.values.every(item => item !== null) && end && <line x1={p.x} y1={p.y} x2={end.x} y2={end.y} />}
            <circle cx={p.x} cy={p.y} r={3.5} />
          </g>;
        })}
      </g>)}
    </svg>
    <figcaption><span className="lp-key-current">{currentLabel}</span>{historyLabel && <span className="lp-key-past">{historyLabel}</span>}</figcaption>
    <p className="lp-note lp-radar-scale"><span>1 Foundations</span> · <span>2 Applied</span> · <span>3 Independent</span> · <span>4 Advanced</span>. Unassessed areas are left blank.</p>
    <ol className="lp-radar-axis-legend">{skills.map(skill => <li key={skill.id}>{skill.label}</li>)}</ol>
    {history && <details className="lp-history-values"><summary>Read comparison values</summary>
      <ul>{skills.map(item => <li key={item.id}><strong>{item.label}</strong>: current {item.level ?? 'not assessed'}; {historyLabel}: {previous.get(item.id) ?? 'not assessed'}</li>)}</ul>
    </details>}
    {history && !history.some(item => item.level !== null) && <p className="lp-note">No skills had been assessed by this date.</p>}
  </figure>;
}
