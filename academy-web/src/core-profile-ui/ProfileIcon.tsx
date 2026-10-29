/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: cbe71716c33a41eb4e189c5d40bf83c927a7f55878a5d7d8fdbb672d0d098790 */
import type { CSSProperties } from 'react';
const paths = {
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6.1 7a7 7 0 0 1 11.6-1L20 9 M4 15l2.3 3A7 7 0 0 0 18 17',
  share: 'M12 16V3 m-4 4 4-4 4 4 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  copy: 'M9 8h10v13H9z M15 8V3H4v13h5',
  open: 'M14 3h7v7 m0-7L10 14 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  link: 'm10 13 4-4 M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M12 18a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1',
  lock: 'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
} as const;
export function ProfileIcon({name, className='',style}: {name:keyof typeof paths;className?:string;style?:CSSProperties}) {
  return <svg className={`lp-icon ${className}`} style={style} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
