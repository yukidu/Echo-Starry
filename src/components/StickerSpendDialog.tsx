import React, { useEffect, useRef } from 'react';
import { Trophy, X } from 'lucide-react';
export function StickerSpendDialog({cost,title,balance,onResolve}:{cost:number;title:string;balance?:number;onResolve:(confirmed:boolean)=>void}) {
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement | null;confirm.current?.focus();return()=>previous?.focus();},[]);
  return <div className="app-modal-overlay sticker-spend-overlay fixed inset-0 flex items-start justify-center p-3 bg-black/60 backdrop-blur-sm" onMouseDown={e=>e.target===e.currentTarget&&onResolve(false)} onKeyDown={e=>{if(e.key==='Escape')onResolve(false);if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));const index=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}}}>
    <div role="dialog" aria-modal="true" aria-labelledby="sticker-spend-title" className="w-full max-w-md rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{backgroundColor:'var(--color-primary,#c06c84)'}}><h2 id="sticker-spend-title" className="font-black flex items-center gap-2"><Trophy className="w-5 h-5"/>使用貼紙解鎖</h2><button type="button" aria-label="關閉" onClick={()=>onResolve(false)} className="p-1"><X className="w-5 h-5"/></button></div>
      <div className="p-5 text-center space-y-3 text-slate-800 dark:text-slate-100"><p className="font-bold text-slate-800 dark:text-slate-100 break-words">{title}</p><p className="text-5xl font-black text-rose-500">-{cost}<span className="text-base ml-1">張貼紙</span></p><p className="text-sm text-slate-600 dark:text-slate-300">解鎖後可永久收聽。{balance!==undefined&&`目前有 ${balance} 張貼紙。`}</p><div className="grid grid-cols-2 gap-2 pt-2"><button type="button" onClick={()=>onResolve(false)} className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold">取消</button><button ref={confirm} type="button" onClick={()=>onResolve(true)} className="py-2.5 rounded-xl text-white font-bold" style={{backgroundColor:'var(--color-primary,#c06c84)'}}>確認解鎖</button></div></div>
    </div>
  </div>;
}
