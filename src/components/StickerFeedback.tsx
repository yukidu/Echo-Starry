import { canChangeStickerBalance } from '../stickerSummaryClient';
import React, { useEffect, useState } from 'react';
let lastPoint: {x:number;y:number}|null=null;
let pointTime=0;
let serial=0;
let rules:any={toastSeconds:1,profileHintSeconds:1,profileReward:1,luckyCompleteReward:1,profileHintText:'尚有欄位未填，完整填寫可+{x}張貼紙',luckyHintText:'這是宇宙給你的答案\n聽完貼紙額外+{x}張'};
export function setFeedbackRules(next:any){rules={...rules,...next};}
export function getFeedbackRules(){return rules;}
export function showStickerNotice(text:string,seconds=rules.toastSeconds){window.dispatchEvent(new CustomEvent('echostars:feedback',{detail:{id:++serial,text,seconds,point:Date.now()-pointTime<3000?lastPoint:null}}));}
export function showStickerDelta(delta:number){if(delta)showStickerNotice(`${delta>0?'+':''}${Number(delta.toFixed(1))}張貼紙`);}
export function StickerFeedback(){
 const [items,setItems]=useState<any[]>([]);
 useEffect(()=>{
  const timers=new Set<ReturnType<typeof setTimeout>>();
  const point=(e:PointerEvent)=>{lastPoint={x:e.clientX,y:e.clientY};pointTime=Date.now();};
  const keyboard=()=>{lastPoint=null;};
  const receive=(e:Event)=>{const item=(e as CustomEvent).detail;setItems(prev=>[...prev.slice(-3),item]);const timer=setTimeout(()=>{setItems(prev=>prev.filter(x=>x.id!==item.id));timers.delete(timer);},Math.max(100,Math.min(60000,item.seconds*1000)));timers.add(timer);};
  document.addEventListener('pointerdown',point,true);document.addEventListener('keydown',keyboard,true);window.addEventListener('echostars:feedback',receive);
  const original=window.fetch;
  const observed:typeof fetch=async(input,init)=>{const response=await original(input,init);const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();const path=new URL(url,window.location.origin);if(response.ok && path.origin===window.location.origin && (canChangeStickerBalance(path.pathname,method) || response.headers.get('X-Echostars-Sticker-Changed')==='1')) window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));return response;};
  window.fetch=observed;
  return()=>{if(window.fetch===observed)window.fetch=original;timers.forEach(clearTimeout);document.removeEventListener('pointerdown',point,true);document.removeEventListener('keydown',keyboard,true);window.removeEventListener('echostars:feedback',receive);};
 },[]);
 return <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[300]">{items.map((item,index)=><div key={item.id} role="status" className="absolute max-w-[min(320px,calc(100vw-24px))] w-max whitespace-pre-wrap rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-4 py-2 shadow-xl text-sm text-center" style={{left:Math.max(Math.min(172,window.innerWidth/2),Math.min(window.innerWidth-Math.min(172,window.innerWidth/2),item.point?.x ?? window.innerWidth/2)),top:Math.max(70,(item.point?.y ?? 140)-55-index*45),transform:'translateX(-50%)'}}>{item.text.split(/([+-]\d+(?:\.\d+)?(?:張貼紙)?)/g).map((part:number|string,i:number)=><span key={i} className={String(part).startsWith('+')?'text-red-500':String(part).startsWith('-')?'text-emerald-500':undefined}>{part}</span>)}</div>)}</div>;
}
