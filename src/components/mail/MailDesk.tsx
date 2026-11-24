"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { mailAct, mailFolders, mailList, mailThread, mailDrafts, mailMove, mailUndoMove, type MailAction, type MessageRow, type ThreadMessage } from "@/app/mail/actions";
import { mailAssigned, mailWorkspace, mailWaiting, mailDone, mailUndoDone } from "@/app/mail/kca-actions";
import type { AccountView } from "@/lib/mail/accounts";
import type { SavedDraft } from "@/lib/mail/drafts";
import type { MoveReceipt } from "@/lib/mail/moves";
import type { MailboxInfo, Special } from "@/lib/mail/client";
import type { ClientNote } from "@/lib/mail/kca-data";
import type { ConversationRow } from "@/lib/mail/conversations";
import { matchIndex, bookingHref, clientsFrom, threadKey } from "@/lib/mail/kca";
import { messageIdentity } from "@/lib/mail/status";
import ConnectMailbox from "./ConnectMailbox";
import MailCompose, {type Draft, type MailComposeHandle} from "./MailCompose";
import MailList, {rowKey} from "./MailList";
import MailReader, {type ReplyKind} from "./MailReader";
import MailSettings from "./MailSettings";
import MailIcon, {KcaMark} from "./MailIcon";
import MailTheme from "./MailTheme";
import { mailRequest } from "./mail-request";
import { checkedAgo, initials, listTime, quoteBlock, replySubject, senderName } from "./mail-format";
import { ClientsView, Inspector, MorningBrief, TemplatesView, type WaitingResult, type Workspace } from "./KcaPanels";
import { MailModal, SearchPalette, ShortcutsSheet, type PaletteItem } from "./MailOverlay";
import { shortcut } from "./shortcuts";
import { UNDO_MS } from "./send-hold";
const RAIL=[["Inbox","inbox"],["Assigned","assigned"],["Drafts","drafts"],["Sent","sent"],["Archive","archive"],["Clients","clients"],["Templates","templates"],["Starred","star"],["Spam","spam"],["Bin","trash"]] as const;
type View=typeof RAIL[number][0]|"Mailboxes";
const SPECIAL:Partial<Record<View,Special>>={Inbox:"inbox",Sent:"sent",Archive:"archive",Spam:"spam",Bin:"trash"};
type Picked={accountId:string;row:MessageRow};
type Toast={id:number;text:string;accessible?:string;undo?:()=>void|Promise<void>};
export default function MailDesk({initialAccounts,initialQuery,demo=false,me="",initialView="Inbox"}:{initialAccounts:AccountView[];initialQuery:string;demo?:boolean;me?:string;initialView?:View}) {
  const [accounts,setAccounts]=useState(initialAccounts),[accountId,setAccountId]=useState(initialAccounts[0]?.id??""),[view,setView]=useState<View>(initialView);
  const [boxes,setBoxes]=useState<MailboxInfo[]>([]),[workspace,setWorkspace]=useState<Workspace|null>(null),[workspaceError,setWorkspaceError]=useState("");
  const [list,setList]=useState<{items:MessageRow[];total:number;error:string|null}>({items:[],total:0,error:null}),[loading,setLoading]=useState(true),[tick,setTick]=useState(0);
  const [waiting,setWaiting]=useState<WaitingResult|null>(null),[unread,setUnread]=useState(initialAccounts[0]?.last_unread_count??0),[checking,setChecking]=useState(true),[syncError,setSyncError]=useState("");
  const [picked,setPicked]=useState<Picked|null>(null),[thread,setThread]=useState<{messages:ThreadMessage[];loading:boolean;error:string|null}>({messages:[],loading:false,error:null});
  const [saved,setSaved]=useState<SavedDraft[]>([]),[filter,setFilter]=useState("all"),[search,setSearch]=useState(initialQuery),[selectedKeys,setSelectedKeys]=useState<string[]>([]);
  const [clientId,setClientId]=useState(""),[inspector,setInspector]=useState(false),[briefOpen,setBriefOpen]=useState(false),[palette,setPalette]=useState(false),[help,setHelp]=useState(false);
  const [draft,setDraft]=useState<Draft|null>(null),[toast,setToast]=useState<Toast|null>(null),[busy,setBusy]=useState(false);
  const compose=useRef<MailComposeHandle>(null),afterClose=useRef<(()=>void)|null>(null),openSequence=useRef(0),mutation=useRef(false),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const account=accounts.find((a)=>a.id===accountId),selected=picked?.row??null,special=SPECIAL[view]??"inbox";
  const folder=view==="Starred"?"__starred__":boxes.find((b)=>b.special===special)?.path??(special==="inbox"?"INBOX":"");
  const nonMail=["Clients","Templates","Mailboxes"].includes(view),setup=!accounts.length;
  useEffect(()=>{const timer=setTimeout(()=>setInspector(window.innerWidth>=1100),0);return()=>clearTimeout(timer);},[]);
  useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
  function notify(text:string,undo?:Toast["undo"],accessible?:string) {
    if(toastTimer.current)clearTimeout(toastTimer.current);
    const id=(toast?.id??0)+1;setToast({id,text,undo,accessible});
    toastTimer.current=setTimeout(()=>setToast((old)=>old?.id===id?null:old),UNDO_MS);
  }
  async function undo() {const action=toast?.undo;if(!action)return;if(toastTimer.current)clearTimeout(toastTimer.current);setToast(null);try{await action();notify("Undone");setTick((n)=>n+1);}catch(e){notify(e instanceof Error?e.message:"Undo failed. The message has been left where it is.");}}
  function closeDraft(){setDraft(null);const next=afterClose.current;afterClose.current=null;next?.();}
  function withDraftClosed(fn:()=>void){if(draft){afterClose.current=fn;compose.current?.close();}else fn();}
  function navigate(next:View){withDraftClosed(()=>{openSequence.current++;setPicked(null);setView(next);setFilter("all");setSearch("");setSelectedKeys([]);setBriefOpen(false);});}
  function changeAccount(id:string){withDraftClosed(()=>{openSequence.current++;setPicked(null);setAccountId(id);setBoxes([]);setView("Inbox");setSearch("");setFilter("all");setSelectedKeys([]);});}
  function updatedAccounts(rows:AccountView[]){setAccounts(rows);if(!rows.some((a)=>a.id===accountId)){setAccountId(rows[0]?.id??"");setPicked(null);}setTick((n)=>n+1);}
  useEffect(()=>{
    if(!accountId)return;let live=true;
    void mailRequest(mailWorkspace(accountId)).then((r)=>{if(!live)return;if(r.ok){setWorkspace(r.data);setWorkspaceError("");}else{setWorkspace(null);setWorkspaceError(r.error);}});
    return()=>{live=false;};
  },[accountId,tick]);
  useEffect(()=>{if(!accountId)return;let live=true;queueMicrotask(()=>{if(live)setChecking(true);});
    void mailRequest(mailFolders(accountId)).then((r)=>{if(!live)return;setChecking(false);if(r.ok){const checked=new Date().toISOString();setBoxes(r.data.boxes);setUnread(r.data.unread);setSyncError("");setAccounts((rows)=>rows.map((a)=>a.id===accountId?{...a,last_synced_at:checked,last_unread_count:r.data.unread,last_error:null}:a));}else setSyncError(r.error);});
    return()=>{live=false;};
  },[accountId,tick]);
  useEffect(()=>{if(!accountId)return;let live=true;void mailRequest(mailWaiting()).then((r)=>{if(live)setWaiting(r);});return()=>{live=false;};},[accountId,tick]);
  useEffect(()=>{if(!accountId||nonMail)return;let live=true;queueMicrotask(()=>{if(live)setLoading(true);});
    if(view==="Drafts")void mailRequest(mailDrafts(accountId)).then((r)=>{if(live){if(r.ok)setSaved(r.data);setList({items:[],total:r.ok?r.data.length:0,error:r.ok?null:r.error});setLoading(false);}});
    else if(view==="Assigned")void mailRequest(mailAssigned()).then((r)=>{if(live){setList(r.ok?{items:r.data.items,total:r.data.items.length,error:r.data.errors.join(" ")||(r.data.partial?"Some conversations could not be read. Results are partial.":null)}:{items:[],total:0,error:r.error});setLoading(false);}});
    else if(folder)void mailRequest(mailList(accountId,folder,{text:search,unread:filter==="unread",flagged:view==="Starred"||filter==="starred"})).then((r)=>{if(live){setList(r.ok?{...r.data,error:null}:{items:[],total:0,error:r.error});setLoading(false);}});
    else queueMicrotask(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[accountId,view,folder,search,filter,tick,nonMail]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible")setTick((n)=>n+1);};const timer=setInterval(refresh,120000);document.addEventListener("visibilitychange",refresh);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};},[]);
  const waitRows=waiting?.ok?waiting.data.items:[];
  const rowAccount=(row:MessageRow)=>(row as ConversationRow).accountId||accountId;
  const waits=(row:MessageRow)=>waitRows.some((w)=>w.accountId===rowAccount(row)&&w.mailbox===row.mailbox&&w.uid===row.uid);
  const visibleItems=list.items.filter((r)=>(filter!=="waiting"||waits(r))&&(filter!=="unread"||!r.seen));
  const waitingKeys=new Set(visibleItems.filter(waits).map(rowKey));
  const match=useMemo(()=>workspace?.directory?matchIndex(workspace.directory)({subject:thread.messages.map((m)=>m.subject).join("\n")||selected?.subject||"",text:thread.messages.map((m)=>m.text).join("\n"),html:thread.messages.map((m)=>m.html??"").join("\n"),addresses:thread.messages.length?thread.messages.flatMap((m)=>[...m.from,...m.to,...m.cc].map((a)=>a.address)):selected?[selected.from.address,...selected.to.map((a)=>a.address),...(selected.cc??[]).map((a)=>a.address)]:[]}):{client:null,booking:null,by:null},[workspace,selected,thread.messages]);
  const selectedMeta=workspace?.meta.find((m)=>m.thread_key===threadKey(selected?.subject??""));
  const latest=thread.messages.at(-1),done=!!latest&&selectedMeta?.done_message_id===messageIdentity(latest);
  async function openRaw(row:MessageRow,replyNow=false){
    const id=rowAccount(row),sequence=++openSequence.current;setAccountId(id);if(nonMail)setView("Inbox");setPicked({accountId:id,row});setBriefOpen(false);setDraft(null);setThread({messages:[],loading:true,error:null});
    const r=await mailRequest(mailThread(id,row.mailbox,row.uid,row.subject));if(sequence!==openSequence.current)return;
    setThread(r.ok?{messages:r.data,loading:false,error:null}:{messages:[],loading:false,error:r.error});
    if(r.ok){setPicked({accountId:id,row:{...row,seen:true}});setList((l)=>({...l,items:l.items.map((m)=>m.uid===row.uid&&m.mailbox===row.mailbox?{...m,seen:true}:m)}));if(replyNow&&r.data.length)reply("reply",r.data.at(-1)!,"",id);setTick((n)=>n+1);}
  }
  function open(row:MessageRow,replyNow=false){withDraftClosed(()=>{void openRaw(row,replyNow);});}
  function draftFor(kind:ReplyKind,m:ThreadMessage):Draft {
    const address=account?.email.toLowerCase(),sender=m.from[0]?.address??"",others=[...new Set([...m.to,...m.cc].map((a)=>a.address).filter((a)=>a&&a.toLowerCase()!==address&&a.toLowerCase()!==sender.toLowerCase()))];
    return {title:kind==="forward"?"Forward":kind==="replyAll"?"Reply all":"Reply",to:kind==="forward"?"":sender.toLowerCase()===address?m.to.map((a)=>a.address).join(", "):sender,cc:kind==="replyAll"?others.join(", "):"",subject:replySubject(m.subject,kind==="forward"?"forward":"reply"),quoted:quoteBlock(m),inReplyTo:kind==="forward"?null:m.messageId,references:kind==="forward"?[]:[...m.references,...(m.messageId?[m.messageId]:[])].slice(-20),answers:kind==="forward"?undefined:{mailbox:m.mailbox,uid:m.uid}};
  }
  function reply(kind:ReplyKind,m:ThreadMessage,text="",id=accountId){if(draft){compose.current?.insert(text);return;}setAccountId(id);setDraft({...draftFor(kind,m),body:text});}
  function replyText(text:string){if(draft)compose.current?.insert(text);else if(latest)reply("reply",latest,text);}
  function nextWaiting(row:MessageRow){return visibleItems.find((r)=>!(r.uid===row.uid&&r.mailbox===row.mailbox&&rowAccount(r)===rowAccount(row))&&waits(r));}
  async function actRow(row:MessageRow,action:MailAction){
    if(mutation.current)return;mutation.current=true;setBusy(true);const id=rowAccount(row),moving=["archive","trash","spam","inbox"].includes(action);
    try{
      if(moving){const rows=selected&&selected.uid===row.uid?thread.messages.filter((m)=>m.mailbox===row.mailbox).map((m)=>m.uid):[];const r=await mailRequest(mailMove(id,row.mailbox,rows.length?rows:[row.uid],action as "archive"|"trash"|"spam"|"inbox"));if(!r.ok){notify(r.error);return;}
        const next=nextWaiting(row);if(selected?.uid===row.uid&&picked?.accountId===id){if(next)void openRaw(next);else{setPicked(null);openSequence.current++;}}
        setSelectedKeys((keys)=>keys.filter((key)=>key!==rowKey(row)));notify(action==="archive"?next?"Archived. Opened the next waiting conversation.":"Archived":action==="trash"?"Moved to Bin":action==="spam"?"Moved to Spam":"Moved to Inbox",async()=>{const result=await mailRequest(mailUndoMove(r.data));if(!result.ok)throw new Error(result.error);const restored=await mailRequest(mailList(id,row.mailbox,{text:row.subject}));if(restored.ok){const hit=restored.data.items.find((m)=>m.messageId===row.messageId)||restored.data.items.find((m)=>threadKey(m.subject)===threadKey(row.subject));if(hit)void openRaw({...hit,accountId:id} as ConversationRow);}});
      }else{const r=await mailRequest(mailAct(id,row.mailbox,[row.uid],action));if(!r.ok){notify(r.error);return;}if(picked?.accountId===id&&selected?.uid===row.uid)setPicked({accountId:id,row:{...row,flagged:action==="star"?true:action==="unstar"?false:row.flagged,seen:action!=="unread"}});notify(action==="unread"?"Marked unread":action==="star"?"Starred":"Message updated");}
      setTick((n)=>n+1);
    }finally{mutation.current=false;setBusy(false);}
  }
  async function markDone(){if(!selected||mutation.current)return;mutation.current=true;setBusy(true);const row=selected,id=picked!.accountId;try{const r=await mailRequest(mailDone(id,row.mailbox,row.uid,row.subject));if(!r.ok){notify(r.error);return;}const next=nextWaiting(row);if(next)void openRaw(next);else{setPicked(null);openSequence.current++;}notify("Marked done",async()=>{const result=await mailRequest(mailUndoDone(id,row.subject,r.data.done_message_id!));if(!result.ok)throw new Error(result.error);void openRaw({...row,accountId:id} as ConversationRow);});setTick((n)=>n+1);}finally{mutation.current=false;setBusy(false);}}
  async function bulk(action:"archive"|"read"){
    if(mutation.current)return;mutation.current=true;setBusy(true);const receipts:MoveReceipt[]=[],failed:string[]=[];const groups=new Map<string,{id:string;folder:string;rows:MessageRow[]}>();
    for(const row of list.items.filter((r)=>selectedKeys.includes(rowKey(r)))){const id=rowAccount(row),key=id+":"+row.mailbox;const g=groups.get(key)??{id,folder:row.mailbox,rows:[]};g.rows.push(row);groups.set(key,g);}
    try{for(const g of groups.values()){if(action==="archive"){const r=await mailRequest(mailMove(g.id,g.folder,g.rows.map((r)=>r.uid),"archive"));if(r.ok)receipts.push(r.data);else failed.push(...g.rows.map(rowKey));}else{const r=await mailRequest(mailAct(g.id,g.folder,g.rows.map((r)=>r.uid),"read"));if(!r.ok)failed.push(...g.rows.map(rowKey));}}
      setSelectedKeys(failed);setPicked(null);notify(failed.length?`${failed.length} messages could not be updated. They stay selected.`:action==="archive"?"Selected conversations archived":"Marked read",receipts.length?async()=>{let errors=0;for(const receipt of receipts){const r=await mailRequest(mailUndoMove(receipt));if(!r.ok)errors++;}if(errors)throw new Error(`Undo failed for ${errors} move${errors===1?"":"s"}. Other moves were restored.`);}:undefined);setTick((n)=>n+1);
    }finally{mutation.current=false;setBusy(false);}
  }
  async function more(){if(busy)return;setBusy(true);const r=await mailRequest(mailList(accountId,folder,{text:search,unread:filter==="unread",flagged:view==="Starred"||filter==="starred"},list.items.length));setBusy(false);if(r.ok)setList((old)=>({items:[...old.items,...r.data.items.filter((m)=>!old.items.some((x)=>rowKey(x)===rowKey(m)))],total:r.data.total,error:null}));else notify(r.error);}
  function saveNote(note:ClientNote){setWorkspace((w)=>w?{...w,notes:[...w.notes.filter((n)=>n.advertiser_email!==note.advertiser_email),note]}:w);}
  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{
      if(palette||help)return;
      const key=shortcut(e);if(!key)return;
      if(key==="search"){e.preventDefault();setPalette(true);return;}if(key==="help"){e.preventDefault();setHelp(true);return;}if(key==="undo"){e.preventDefault();void undo();return;}
      if(key==="escape"){const menu=document.querySelector('.mail-app .menu-wrap[open]');if(menu)menu.removeAttribute("open");else if(draft)compose.current?.close();else if(inspector&&window.innerWidth<1100)setInspector(false);else{setPicked(null);setBriefOpen(false);openSequence.current++;}return;}
      if(nonMail)return;
      const index=visibleItems.findIndex((r)=>r.uid===selected?.uid&&r.mailbox===selected.mailbox&&rowAccount(r)===picked?.accountId);
      if(key==="next"||key==="previous"){e.preventDefault();const row=visibleItems[Math.max(0,Math.min(visibleItems.length-1,index+(key==="next"?1:-1)))];if(row)open(row);return;}
      if(!selected)return;
      if(key==="inspector")setInspector((v)=>!v);if(key==="archive"){e.preventDefault();void actRow(selected,"archive");}if(key==="done")void markDone();if(key==="star")void actRow(selected,selected.flagged?"unstar":"star");if(key==="unread")void actRow(selected,"unread");if(["reply","replyAll","forward"].includes(key)&&latest){e.preventDefault();reply(key as ReplyKind,latest);}
    };
    window.addEventListener("keydown",keydown);return()=>window.removeEventListener("keydown",keydown);
  });
  const known=[...waitRows,...list.items.map((row)=>({...row,accountId:rowAccount(row)}))].filter((r,i,all)=>all.findIndex((m)=>m.accountId===r.accountId&&m.mailbox===r.mailbox&&m.uid===r.uid)===i);
  const clients=workspace?.directory?clientsFrom(workspace.directory):[];
  const goTo=(path:string)=>{window.location.assign(path);};
  const paletteItems:PaletteItem[]=[
    ...known.map((r)=>({id:`thread-${r.accountId}-${r.mailbox}-${r.uid}`,group:"Conversations",icon:"inbox",label:r.subject,hint:senderName(r.from),row:r})),
    ...clients.map((c)=>({id:`client-${c.id}`,group:"Clients",icon:"clients",label:c.advertiser.business,hint:c.advertiser.name,run:()=>{navigate("Clients");setClientId(c.id);}})),
    ...clients.flatMap((c)=>c.bookings.map((b)=>({id:`booking-${b.id}`,group:"Bookings",icon:"calendar",label:`${b.reference} | ${c.advertiser.business}`,hint:b.status,run:()=>goTo(bookingHref(b))}))),
    ...accounts.map((a)=>({id:`mailbox-${a.id}`,group:"Mailboxes",icon:"inbox",label:`Switch to ${a.email}`,hint:a.last_error??"",run:()=>changeAccount(a.id)})),
    ...[["Overview",""],["Bookings","/bookings"],["Advert desk","/adverts"],["Schedule","/schedule"],["Settings","/settings"]].map(([label,path])=>({id:`manager-${path}`,group:"Manager",icon:"manager",label:`Open ${label}`,hint:"/manage"+path,run:()=>goTo("/manage"+path)})),
    {id:"shortcuts",group:"Actions",icon:"key",label:"Keyboard shortcuts",hint:"?",run:()=>setHelp(true)}
  ];
  const newEmail=(email="")=>withDraftClosed(()=>setDraft({title:"New email",to:email,cc:"",subject:""}));
  const railItem=(name:View,icon:string,phone=true)=><button type="button" key={name} className="rail-item" data-phone={phone?"yes":"no"} aria-current={view===name?"page":undefined} onClick={()=>navigate(name)}><MailIcon name={icon}/><span>{name==="Mailboxes"?"Settings":name}</span>{name==="Inbox"&&unread>0&&<span className="badge">{unread}</span>}</button>;
  const composeView=draft&&account?<MailCompose ref={compose} key={draft.saved?.id??draft.subject+draft.title} accountId={accountId} from={account.email} draft={draft} templates={workspace?.templates} modes={draft.title!=="New email"&&latest?{reply:draftFor("reply",latest),replyAll:draftFor("replyAll",latest),forward:draftFor("forward",latest)}:undefined} onClose={closeDraft} onHold={(cancel)=>notify("Sending in 5 seconds",cancel,"If this page closes before the hold ends, the saved message stays in Drafts unsent.")} onSent={()=>{setDraft(null);notify(demo?"Saved to sample Sent. No email was delivered.":"Sent");setTick((n)=>n+1);}}/>:null;
  return <section className="app mail-shell">
    <nav className="rail" aria-label="Mail navigation"><Link href="/mail" className="logo" aria-label="KCA Mail"><KcaMark/></Link><div className="rail-group">{RAIL.map(([name,icon])=>railItem(name,icon,name==="Inbox"||name==="Clients"))}<button type="button" className="rail-item phone-only" onClick={()=>setPalette(true)}><MailIcon name="search"/><span>Search</span></button><details className="menu-wrap rail-phone-more phone-only"><summary className="rail-item"><MailIcon name="more"/><span>More</span></summary><div className="menu">{RAIL.filter(([name])=>name!=="Inbox"&&name!=="Clients").map(([name])=><button type="button" key={name} onClick={(e)=>{e.currentTarget.closest("details")?.removeAttribute("open");navigate(name);}}>{name}</button>)}<button type="button" onClick={()=>{setPicked(null);setBriefOpen(true);}}>Morning brief</button><button type="button" onClick={()=>setHelp(true)}>Keyboard shortcuts</button></div></details></div><div className="rail-spacer"/><div className="rail-group"><button type="button" className="rail-item" data-phone="no" onClick={()=>{navigate("Inbox");setBriefOpen(true);}}><MailIcon name="bolt"/><span>Brief</span></button><Link href="/manage" className="rail-item"><MailIcon name="manager"/><span>Manager</span></Link>{railItem("Mailboxes","settings")}<button type="button" className="rail-item" data-phone="no" onClick={()=>setHelp(true)} aria-label="Keyboard shortcuts"><MailIcon name="key"/><span>Shortcuts</span></button></div><span className="avatar-me" title={me}>{initials("",me)}</span></nav>
    <header className="topbar"><h1 className="sr">Mail</h1><button type="button" className="search-btn" onClick={()=>setPalette(true)}><MailIcon name="search" size="sm"/><span>Search mail, clients and bookings</span><kbd>Ctrl K</kbd></button><div className="top-right"><button type="button" className="sync" onClick={()=>setTick((n)=>n+1)} title={checking?"Checking":syncError||account?.last_error||checkedAgo(account?.last_synced_at)} aria-label={checking?"Checking mail":syncError||account?.last_error||`Up to date, ${checkedAgo(account?.last_synced_at)}`}><i className={`dot ${syncError||account?.last_error?"warn":""}`}/><span>{checking?"Checking":syncError||account?.last_error?"Check failed":"Up to date"}</span></button>{/password|sign-in|reconnect/i.test(syncError||account?.last_error||"")&&<button className="link" type="button" onClick={()=>navigate("Mailboxes")}>Reconnect</button>}<MailTheme/><button type="button" className={`btn top-new ${account?"gold mg-primary":"line"}`} disabled={!account} aria-label="New email" onClick={()=>newEmail()}><MailIcon name="plus" size="sm"/><span>New email</span></button></div></header>
    <main className={`work ${nonMail||setup?"full-work":""}`} data-insp={selected&&inspector?"open":"closed"} data-view={selected||briefOpen?"reader":"list"} aria-busy={busy}>
      {setup?<section className="panel main"><div className="setup-wrap"><ConnectMailbox first demo={demo} onConnected={(a)=>updatedAccounts([a])}/></div></section>:view==="Mailboxes"?<MailSettings accounts={accounts} demo={demo} onAccounts={updatedAccounts}/>:view==="Clients"?workspace?<ClientsView workspace={workspace} clientId={clientId} onClient={setClientId} onNote={saveNote} onNew={newEmail} onOpen={open}/>:<div className="panel empty-state">{workspaceError||"Loading clients"}</div>:view==="Templates"?workspace?<TemplatesView templates={workspace.templates} onUpdated={()=>setTick((n)=>n+1)}/>:<div className="panel empty-state">{workspaceError||"Loading templates"}</div>:<>
      <section className="panel list" aria-label="Conversations"><div className="list-head"><div className="list-title"><h1>{view==="Assigned"?"Assigned to you":view}</h1><label className="mb-switch"><i className={`dot ${syncError?"warn":""}`}/><span className="sr">Mailbox</span><select aria-label="Mailbox" value={accountId} onChange={(e)=>changeAccount(e.target.value)}>{accounts.map((a)=><option key={a.id} value={a.id}>{a.email}</option>)}</select></label><button type="button" className="list-refresh" title="Refresh mailbox" aria-label="Refresh mailbox" onClick={()=>setTick((n)=>n+1)}><MailIcon name="clock" size="xs"/></button></div>{search&&<p>Results for &ldquo;{search}&rdquo;</p>}{view!=="Drafts"&&<div className="filters">{selectedKeys.length?<div className="bulk" role="toolbar" aria-label="Selected conversations"><b>{selectedKeys.length} selected</b><button type="button" className="btn ghost" disabled={busy} onClick={()=>void bulk("archive")}>Archive</button><button type="button" className="btn ghost" disabled={busy} onClick={()=>void bulk("read")}>Mark read</button><button type="button" className="btn ghost icon" aria-label="Clear selection" onClick={()=>setSelectedKeys([])}><MailIcon name="x" size="xs"/></button></div>:<div className="seg" role="group" aria-label="Filter">{["all","unread","waiting","starred"].map((f)=><button type="button" key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}</div>}</div>}</div>
      {view==="Drafts"?<div className="list-scroll">{loading?<p>Loading drafts</p>:list.error?<p role="alert">{list.error}</p>:!saved.length?<p className="list-end">No saved drafts.</p>:saved.map((r)=><button type="button" className="row draft-row" key={r.id} onClick={()=>withDraftClosed(()=>setDraft({...r.data,saved:r}))}><span className="av"><MailIcon name="drafts" size="sm"/></span><span className="row-main"><b>{r.data.subject||"(no subject)"}</b><span className="row-snip">{r.data.to||"No recipient"}</span><time className="row-time mono">{listTime(r.updated_at)}</time>{r.send_state!=="draft"&&<small>Check Sent before sending again</small>}</span></button>)}<p className="list-end">Your personal drafts in this app. Mail-server drafts stay on the mail server.</p></div>:!folder&&view!=="Assigned"?<div className="empty-state">{boxes.length?`This mailbox has no ${view} folder.`:"Loading folders"}</div>:<MailList items={visibleItems} selected={selected?rowKey(selected):null} sentFolder={special==="sent"} inbox={view==="Inbox"} waitingKeys={waitingKeys} loading={loading} error={list.error} hasMore={view!=="Assigned"&&list.items.length<list.total} onOpen={open} onMore={()=>void more()} onRetry={()=>setTick((n)=>n+1)} selectedKeys={selectedKeys} onSelect={(r)=>setSelectedKeys((keys)=>keys.includes(rowKey(r))?keys.filter((k)=>k!==rowKey(r)):[...keys,rowKey(r)])} onAct={(r,action)=>void actRow(r,action)} business={(r)=>workspace?.directory?matchIndex(workspace.directory)({subject:r.subject,addresses:[r.from.address,...r.to.map((a)=>a.address)]}).client?.advertiser.business??"":""} assignment={(r)=>{const email=workspace?.meta.find((m)=>m.thread_key===threadKey(r.subject))?.assigned_email;return workspace?.people.find((p)=>p.email===email)?.name??email??"";}}/>}
      </section><section className="panel main" aria-label={selected?"Conversation":"Morning brief"}>{!selected?<><button type="button" className="btn ghost back-btn" onClick={()=>setBriefOpen(false)}>Back to list</button><MorningBrief workspace={workspace} waiting={waiting} unread={accounts.reduce((sum,a)=>sum+(a.last_unread_count??0),0)} onOpen={open}/></>:<MailReader accountId={picked!.accountId} special={boxes.find((b)=>b.path===selected.mailbox)?.special??special} messages={thread.messages} loading={thread.loading} error={thread.error} flagged={selected.flagged} onAct={(action)=>void actRow(selected,action)} onReply={reply} onBack={()=>withDraftClosed(()=>{setPicked(null);openSequence.current++;})} onRetry={()=>open(selected)} onDone={()=>void markDone()} done={done} waiting={waits(selected)} onInspector={()=>setInspector((v)=>!v)} inspector={inspector} bookedSeconds={match.booking?.request.lengthSeconds} chips={<div className="chips">{match.client&&<button type="button" className="chip" onClick={()=>{navigate("Clients");setClientId(match.client!.id);}}><MailIcon name="clients" size="xs"/>{match.client.advertiser.business}</button>}{match.booking&&<a className="chip" href={bookingHref(match.booking)}><span className="mono">{match.booking.reference}</span>{match.booking.status}</a>}{!match.client&&<span className="chip">{workspace?.directory?"Unmatched conversation":"Booking lookup unavailable"}</span>}{selectedMeta?.assigned_email&&<span className="chip"><MailIcon name="assigned" size="xs"/>{workspace?.people.find((p)=>p.email===selectedMeta.assigned_email)?.name??selectedMeta.assigned_email}</span>}</div>}>{draft&&draft.title!=="New email"?composeView:latest&&<div className="dock"><button type="button" className="dock-closed" onClick={()=>reply("reply",latest)}><MailIcon name="reply" size="sm"/><span>Reply to {senderName(latest.from[0]??{name:"",address:""})}</span><small>from {account?.email}</small><kbd>R</kbd></button></div>}</MailReader>}</section>
      {selected&&inspector&&workspace&&!thread.loading&&<Inspector match={match} workspace={workspace} accountId={picked!.accountId} subject={selected.subject} onClose={()=>setInspector(false)} onClient={(id)=>{navigate("Clients");setClientId(id);}} onReplyText={replyText} onUpdated={()=>setTick((n)=>n+1)} onNote={saveNote}/>}
      </>}
    </main>
    {draft&&(draft.title==="New email"||!selected)&&<MailModal label="Write an email" className="compose-modal" onClose={()=>compose.current?.close()}>{composeView}</MailModal>}
    {palette&&<SearchPalette onConversation={open} items={paletteItems} errors={[...(waiting?.ok?waiting.data.errors:waiting?[waiting.error]:[]),...(list.error?[list.error]:[])]} onClose={()=>setPalette(false)}/>}{help&&<ShortcutsSheet onClose={()=>setHelp(false)}/>}
    {toast&&<div className="toast" role="status" key={toast.id}><span>{toast.text}</span>{toast.accessible&&<span className="sr">{toast.accessible}</span>}{toast.undo&&<button type="button" onClick={()=>void undo()}>Undo <kbd>Z</kbd></button>}<i className="bar" style={{animation:`mail-drain ${UNDO_MS}ms linear forwards`}}/></div>}{demo&&<span className="sample-label">Sample data. No email is delivered.</span>}
  </section>;
}
