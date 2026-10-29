/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: e1351499c44dae4c08e4d519a19caf23d6e053e21d174d2bc419e09e97576e55 */
import { useEffect, useId, useRef, useState } from 'react';
import './ProfileControls.css';

export type ProfileOption<T extends string> = { value: T; label: string; accessibleLabel?: string };

export function ProfileChoice<T extends string>({ label, value, options, onChange, disabled = false, prominent = false }: {
  label: string; value: T; options: ProfileOption<T>[]; onChange: (value: T) => void; disabled?: boolean; prominent?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const typed = useRef({ text: '', at: 0 });
  const selected = options.findIndex(item => item.value === value);
  useEffect(() => {
    if (!open) return;
    items.current[Math.max(selected, 0)]?.focus();
    const outside = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [open, selected]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className={`profile-choice${prominent ? ' profile-choice-prominent' : ''}`}>
    <span className="profile-control-label" id={`${id}-label`}>{label}</span>
    <button type="button" ref={trigger} className="profile-choice-trigger" disabled={disabled || options.length === 0}
      aria-label={`${label}: ${options[selected]?.label ?? 'Choose'}`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(current => !current)}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <span>{options[selected]?.label ?? 'Choose'}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <div className="profile-choice-menu" id={id} role="listbox" aria-labelledby={`${id}-label`}
      onKeyDown={event => {
        const index = items.current.findIndex(item => item === event.target);
        let next: number | undefined;
        if (event.key === 'ArrowDown') next = (index + 1) % options.length;
        if (event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = options.length - 1;
        if (next !== undefined) { event.preventDefault(); items.current[next]?.focus(); }
        else if (event.key === 'Escape') { event.preventDefault(); close(); }
        else if (event.key === 'Tab') setOpen(false);
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now();
          typed.current = { text: now - typed.current.at < 600 ? typed.current.text + event.key.toLowerCase() : event.key.toLowerCase(), at: now };
          const match = options.findIndex(item => item.label.toLowerCase().startsWith(typed.current.text));
          if (match >= 0) { event.preventDefault(); items.current[match]?.focus(); }
        }
      }}>
      {options.map((option, index) => <button key={option.value} type="button" role="option" tabIndex={-1}
        ref={element => { items.current[index] = element; }} aria-selected={option.value === value}
        onClick={() => { onChange(option.value); close(); }}>
        <span>{option.label}</span>{option.value === value && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
      </button>)}
    </div>}
  </div>;
}

export function ProfileSegments<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T; options: ProfileOption<T>[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <div className="profile-segments" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
      disabled={disabled} aria-label={option.accessibleLabel ?? option.label} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
