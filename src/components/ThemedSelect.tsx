import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;
export function ThemedSelect({children,value,defaultValue,onChange,className,disabled,...props}:Props) {
  const select = useRef<HTMLSelectElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open,setOpen] = useState(false);
  const [local,setLocal] = useState(defaultValue);
  const [box,setBox] = useState({left:0,top:0,width:180,height:280});
  const id=useId();
  const selected=value ?? local;
  useEffect(()=>{
    if(!open)return;
    const place=()=>{const r=button.current!.getBoundingClientRect();const height=Math.min(280,window.innerHeight-24);setBox({left:Math.max(8,Math.min(r.left,window.innerWidth-Math.max(r.width,180)-8)),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-height-8)),width:Math.min(Math.max(r.width,180),window.innerWidth-16),height});};
    const close=(e:Event)=>{if(!button.current?.contains(e.target as Node)&&!menu.current?.contains(e.target as Node))setOpen(false);};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);document.addEventListener('pointerdown',close);
    requestAnimationFrame(()=>menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
    return ()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',close);};
  },[open]);
  const [options,setOptions]=useState<HTMLOptionElement[]>([]);
  useLayoutEffect(()=>setOptions(Array.from(select.current?.options||[])),[children]);
  return <span className={`relative inline-block max-w-full ${className?.includes("w-full") ? "w-full" : ""}`}>
    <select {...props} ref={select} value={value} defaultValue={defaultValue} disabled={disabled} tabIndex={-1} aria-hidden="true" className="sr-only pointer-events-none" onChange={onChange}>{children}</select>
    <button ref={button} type="button" disabled={disabled} className={className} style={{...props.style,borderColor:'var(--color-primary)',minHeight:36,width:'100%'}}
      aria-label={props['aria-label']||props.title} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
      onClick={()=>setOpen(!open)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);}}}>
      {options.find(o=>o.value===String(selected))?.text || options.find(o=>o.selected)?.text || String(selected||'請選擇')} <span aria-hidden="true">⌄</span>
    </button>
    {open&&createPortal(<div ref={menu} id={id} role="listbox" style={{position:'fixed',left:box.left,top:box.top,width:box.width,maxHeight:box.height,borderColor:'var(--color-primary)'}} className="z-[200] overflow-y-auto rounded-xl border bg-white dark:bg-slate-900 shadow-xl p-1 text-sm"
      onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const list=Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const i=list.indexOf(document.activeElement as HTMLButtonElement);list[e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();}}}>
      {options.map(o=><button type="button" role="option" key={o.value} disabled={o.disabled} aria-selected={o.value===String(selected)} className="w-full text-left px-3 py-2 rounded-lg text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40" style={o.value===String(selected)?{backgroundColor:'var(--color-primary)',color:'white'}:undefined}
        onClick={()=>{setLocal(o.value);const native=select.current!;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(native,o.value);native.dispatchEvent(new Event('change',{bubbles:true}));setOpen(false);button.current?.focus();}}>{o.text}</button>)}
    </div>,document.body)}
  </span>;
}
