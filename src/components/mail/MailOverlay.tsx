"use client";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ConversationRow } from "@/lib/mail/conversations";
import MailIcon, { type MailIconName } from "./MailIcon";
import { SHORTCUTS } from "./shortcuts";
/** Where the panel flies to and from: the button that opened it, or just below its resting place. */
function awayFrom(panel:HTMLElement,from:DOMRect|null){
  if(!from)return "translateY(10px) scale(.97)";
  const r=panel.getBoundingClientRect();
  return `translate(${Math.round(from.left+from.width/2-(r.left+r.width/2))}px, ${Math.round(from.top+from.height/2-(r.top+r.height/2))}px) scale(.5)`;
}
/**
 * A modal dialog that grows out of the button that opened it and shrinks back into it, faster, when closed.
 * Escape, a click outside and any button marked data-modal-close all close it the same way.
 * With exitFirst off, those hand straight to onClose, which may refuse (a draft that fails to save);
 * the owner then plays the exit itself through the handle's leave() once it really closes.
 */
export type ModalHandle={leave:()=>Promise<void>};
export function MailModal({label,onClose,children,className="",role,exitFirst=true,ref:handle}: {label:string;onClose:()=>void;children:React.ReactNode;className?:string;role?:"alertdialog";exitFirst?:boolean;ref?:React.Ref<ModalHandle>}) {
  const ref=useRef<HTMLDialogElement>(null),from=useRef<DOMRect|null>(null),leaving=useRef(false),done=useRef(onClose);
  useEffect(()=>{done.current=onClose;});
  useEffect(()=>{
    const el=ref.current,trigger=document.activeElement;
    from.current=trigger instanceof HTMLElement&&trigger!==document.body&&!el?.contains(trigger)?trigger.getBoundingClientRect():null;
    if(el&&!el.open)el.showModal();
    const p=el?.firstElementChild;
    if(p instanceof HTMLElement&&motionAllowed()&&typeof p.animate==="function")p.animate([{transform:awayFrom(p,from.current),opacity:0},{transform:"none",opacity:1}],{duration:240,easing:"cubic-bezier(.2,0,0,1)"});
    return ()=>{el?.close();};
  },[]);
  const exit=useRef<Promise<void>|null>(null);
  /** Plays the exit and resolves when it ends. It never closes anything by itself. */
  function leave(){
    if(exit.current)return exit.current;
    const el=ref.current,p=el?.firstElementChild;
    if(!(p instanceof HTMLElement)||!motionAllowed()||typeof p.animate!=="function")return Promise.resolve();
    leaving.current=true;el?.classList.add("is-leaving");
    exit.current=p.animate([{transform:"none",opacity:1},{transform:awayFrom(p,from.current),opacity:0}],{duration:150,easing:"cubic-bezier(.4,0,1,1)",fill:"forwards"}).finished.then(()=>undefined,()=>undefined);
    return exit.current;
  }
  useImperativeHandle(handle,()=>({leave}));
  function close(){
    if(leaving.current)return;
    if(!exitFirst){done.current();return;}
    void leave().then(()=>done.current());
  }
  return <dialog ref={ref} role={role} className={`mail-modal ${className}`} aria-label={label} onCancel={(e)=>{e.preventDefault();close();}} onClick={(e)=>{if(e.target===e.currentTarget||(e.target as Element).closest?.("[data-modal-close]"))close();}}>{children}</dialog>;
}
const motionAllowed=()=>typeof matchMedia==="function"&&!matchMedia("(prefers-reduced-motion: reduce)").matches;

type Ask={title:string;text:string;action:string;icon?:MailIconName};
/** A styled replacement for window.confirm. Cancel has focus, so Enter never destroys anything by accident. */
export function useConfirm(){
  const [ask,setAsk]=useState<(Ask&{resolve:(yes:boolean)=>void})|null>(null),yes=useRef(false);
  const confirm=(question:Ask)=>new Promise<boolean>((resolve)=>{yes.current=false;setAsk({...question,resolve});});
  const dialog=ask&&<MailModal label={ask.title} role="alertdialog" className="confirm-modal" onClose={()=>{ask.resolve(yes.current);setAsk(null);}}><section className="confirm-card">
    <span className="confirm-icon"><MailIcon name={ask.icon??"trash"}/></span><h2>{ask.title}</h2><p>{ask.text}</p>
    <div className="confirm-actions"><button type="button" className="btn line" autoFocus data-modal-close>Cancel</button><button type="button" className="btn danger" data-modal-close onClick={()=>{yes.current=true;}}>{ask.action}</button></div>
  </section></MailModal>;
  return [dialog,confirm] as const;
}
export type PaletteItem={id:string;group:string;icon:MailIconName;label:string;hint:string;run?:()=>void;row?:ConversationRow};
export function SearchPalette({items,errors,onClose,onConversation,onSearchMail}: {items:PaletteItem[];errors:string[];onClose:()=>void;onConversation:(row:ConversationRow)=>void;onSearchMail?:(text:string)=>void}) {
  const [query,setQuery]=useState(""),[index,setIndex]=useState(0);
  const words=query.toLowerCase().split(/\s+/).filter(Boolean),text=query.trim();
  // Every word must appear somewhere, so "amina kisumu" finds Amina's Kisumu booking.
  const found=items.filter((i)=>{const hay=`${i.label} ${i.hint} ${i.group}`.toLowerCase();return words.every((w)=>hay.includes(w));}).slice(0,40);
  // Loaded mail is only the latest page, so a typed search can always go on to the mail server.
  const matches:PaletteItem[]=text&&onSearchMail?[...found,{id:"search-mail",group:"Search the mailbox",icon:"search",label:`Search all mail for “${text}”`,hint:"Older mail too",run:()=>onSearchMail(text)}]:found;
  const selected=Math.min(index,Math.max(0,matches.length-1));
  const list=useRef<HTMLDivElement>(null);
  useEffect(()=>{list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest"});},[selected]);
  const run=(item:PaletteItem)=>{onClose();if(item.row)onConversation(item.row);else item.run?.();};
  return <MailModal label="Search mail, clients and bookings" onClose={onClose} className="search-modal"><section className="palette" onKeyDown={(e)=>{if(e.key==="ArrowDown"){e.preventDefault();setIndex(Math.min(matches.length-1,selected+1));}if(e.key==="ArrowUp"){e.preventDefault();setIndex(Math.max(0,selected-1));}if(e.key==="Enter"&&matches[selected]){e.preventDefault();run(matches[selected]);}}}>
    <div className="pal-in"><MailIcon name="search"/><input autoFocus aria-label="Search mail, clients, KCA references, pages" placeholder="Search mail, clients, KCA references, pages" value={query} onChange={(e)=>{setQuery(e.target.value);setIndex(0);}} aria-controls="mail-palette-results" aria-activedescendant={matches[selected]?.id}/><button type="button" className="btn ghost icon" data-modal-close aria-label="Close search"><MailIcon name="x" size="sm"/></button><kbd>Esc</kbd></div>
    <div className="pal-list" ref={list} role="listbox" id="mail-palette-results" aria-label="Search results">{matches.length ? matches.map((item,i)=><div key={item.id}>{(i===0||item.group!==matches[i-1].group)&&<div className="pal-g">{item.group}</div>}<button type="button" className="pal-item" id={item.id} role="option" aria-selected={selected===i} onClick={()=>run(item)}><MailIcon name={item.icon} size="sm"/><span>{item.label}</span><small>{item.hint}</small></button></div>) : <p className="pal-empty">Nothing matches this search. Try a business name or KCA reference.</p>}</div>
    {!!errors.length&&<div className="palette-errors" role="status">{errors.map((error)=><p key={error}>{error}</p>)}</div>}
    <footer className="pal-foot"><span><kbd>Up</kbd> <kbd>Down</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span><span><kbd>?</kbd> all shortcuts</span></footer>
  </section></MailModal>;
}
export function ShortcutsSheet({onClose}:{onClose:()=>void}) {
  return <MailModal label="Keyboard shortcuts" onClose={onClose} className="search-modal"><section className="palette shortcuts-sheet"><header className="pal-in"><h2>Keyboard shortcuts</h2><button type="button" className="btn ghost icon" data-modal-close aria-label="Close shortcuts"><MailIcon name="x"/></button></header><dl>{SHORTCUTS.map(([key,label])=><div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl><p className="pal-foot">Letter shortcuts pause while you type in a field.</p></section></MailModal>;
}
