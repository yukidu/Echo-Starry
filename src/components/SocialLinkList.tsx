import React from 'react';
import { AtSign, Facebook, Instagram, Link, Music2, Youtube } from 'lucide-react';
import type { SocialLinkItem, SocialPlatform } from '../types';

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  const cls = 'w-4 h-4 shrink-0';
  if (platform === 'IG') return <Instagram className={cls}/>;
  if (platform === 'FB') return <Facebook className={cls}/>;
  if (platform === 'Youtube') return <Youtube className={cls}/>;
  if (platform === 'Threads(脆)') return <AtSign className={cls}/>;
  if (platform === '抖音') return <Music2 className={cls}/>;
  return <Link className={cls}/>;
}

export const SocialLinkList: React.FC<{ links?: SocialLinkItem[] }> = ({ links = [] }) => {
  const valid = links.filter(link => String(link?.url || '').trim());
  if (!valid.length) return null;
  return <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 text-xs">
    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5"><Link className="w-4 h-4"/>社群連結</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {valid.map((link,index)=><a key={`${link.platform}-${index}`} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[var(--color-primary,#c06c84)] transition-colors text-slate-700 dark:text-slate-200 font-semibold">
        <PlatformIcon platform={link.platform}/><span className="truncate">{link.name || link.platform}</span>
      </a>)}
    </div>
  </div>;
};
