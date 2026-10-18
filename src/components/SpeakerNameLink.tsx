import React from 'react';
import { splitSpeakerNames } from '../../shared/speakers';

export function openSpeakerProfile(name:string) {
  const clean=String(name||'').trim();
  if (!clean) return;
  window.dispatchEvent(new CustomEvent('echostars:open-speaker',{detail:{name:clean}}));
}

/** Reusable, keyboard-accessible speaker-name link. Keep ranks outside this component. */
export const SpeakerNameLink:React.FC<{name:string;className?:string;single?:boolean}>=({name,className='',single=false})=>{
  const list=single?[name]:splitSpeakerNames(name);
  if(!list.length)return <span>{name}</span>;
  return <>{list.map((n,i)=><React.Fragment key={n+'-'+i}>
    {i>0&&<span aria-hidden="true"> &amp; </span>}
    <button type="button" data-speaker-name={n} title={'查看 '+n+' 的演講者資料'} aria-label={'查看 '+n+' 的演講者資料'}
      className={`speaker-name-link inline text-inherit font-inherit hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current cursor-pointer ${className}`}
      onClick={e=>{e.preventDefault();e.stopPropagation();openSpeakerProfile(n);}}>{n}</button>
  </React.Fragment>)}</>;
};
