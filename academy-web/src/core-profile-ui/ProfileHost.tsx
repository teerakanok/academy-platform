/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: 331f4c1a6640c1db096e4d587f781a57a41465e0d373900bc64e193deab75b81 */
import type { CSSProperties, ReactNode } from 'react';
/** Trusted host application tokens, never accepted from a share URL or API data.
 * Omit tokens to inherit the application's existing theme (for example Crux). */
export interface ProfileThemeTokens {
  background: string; panel: string; panelAlt: string; ink: string; muted: string;
  accent: string; accentText: string; onAccent: string; accentSoft: string;
  border: string; borderStrong: string; warning: string; fontFamily?: string;
}
export function ProfileHost({children, tokens, label}: {children:ReactNode;tokens?:ProfileThemeTokens;label?:string}) {
  const style = tokens ? {
    '--bg':tokens.background,'--panel':tokens.panel,'--panel-2':tokens.panelAlt,
    '--ink':tokens.ink,'--muted':tokens.muted,'--signal':tokens.accent,
    '--signal-text':tokens.accentText,'--on-signal':tokens.onAccent,'--signal-dim':tokens.accentSoft,
    '--hair':tokens.border,'--hair-2':tokens.borderStrong,'--warn':tokens.warning,
    ...(tokens.fontFamily ? {fontFamily:tokens.fontFamily} : {}),
  } as CSSProperties : undefined;
  return <div className="profile-host" data-profile-host={label} style={style}>{children}</div>;
}
