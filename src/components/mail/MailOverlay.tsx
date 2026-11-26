"use client";
import { useEffect, useRef, useState } from "react";
import type { ConversationRow } from "@/lib/mail/conversations";
import MailIcon, { type MailIconName } from "./MailIcon";
import { SHORTCUTS } from "./shortcuts";
export function MailModal({label,onClose,children,className=""}: {label:string;onClose:()=>void;children:React.ReactNode;className?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;if(el&&!el.open) el.showModal();return ()=>{el?.close();};},[]);
  return <dialog ref={ref} className={`mail-modal ${className}`} aria-label={label} onCancel={(e)=>{e.preventDefault();onClose();}} onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>{children}</dialog>;
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
    <div className="pal-in"><MailIcon name="search"/><input autoFocus aria-label="Search mail, clients, KCA references, pages" placeholder="Search mail, clients, KCA references, pages" value={query} onChange={(e)=>{setQuery(e.target.value);setIndex(0);}} aria-controls="mail-palette-results" aria-activedescendant={matches[selected]?.id}/><button type="button" className="btn ghost icon" onClick={onClose} aria-label="Close search"><MailIcon name="x" size="sm"/></button><kbd>Esc</kbd></div>
    <div className="pal-list" ref={list} role="listbox" id="mail-palette-results" aria-label="Search results">{matches.length ? matches.map((item,i)=><div key={item.id}>{(i===0||item.group!==matches[i-1].group)&&<div className="pal-g">{item.group}</div>}<button type="button" className="pal-item" id={item.id} role="option" aria-selected={selected===i} onClick={()=>run(item)}><MailIcon name={item.icon} size="sm"/><span>{item.label}</span><small>{item.hint}</small></button></div>) : <p className="pal-empty">Nothing matches this search. Try a business name or KCA reference.</p>}</div>
    {!!errors.length&&<div className="palette-errors" role="status">{errors.map((error)=><p key={error}>{error}</p>)}</div>}
    <footer className="pal-foot"><span><kbd>Up</kbd> <kbd>Down</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span><span><kbd>?</kbd> all shortcuts</span></footer>
  </section></MailModal>;
}
export function ShortcutsSheet({onClose}:{onClose:()=>void}) {
  return <MailModal label="Keyboard shortcuts" onClose={onClose} className="search-modal"><section className="palette shortcuts-sheet"><header className="pal-in"><h2>Keyboard shortcuts</h2><button type="button" className="btn ghost icon" onClick={onClose} aria-label="Close shortcuts"><MailIcon name="x"/></button></header><dl>{SHORTCUTS.map(([key,label])=><div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl><p className="pal-foot">Letter shortcuts pause while you type in a field.</p></section></MailModal>;
}
