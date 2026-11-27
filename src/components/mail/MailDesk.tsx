"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { signOutOfMail } from "@/app/manage/auth-actions";
import { mailAct, mailFolders, mailList, mailThread, mailDrafts, mailDeleteDraft, mailSaveDraft, mailMove, mailUndoMove, mailStatus, type MailAction, type MessageRow, type ThreadMessage } from "@/app/mail/actions";
import { mailAssign, mailAssigned, mailWorkspace, mailWaiting, mailDone, mailUndoDone, mailSnooze, mailRemind, mailFollowUps } from "@/app/mail/kca-actions";
import type { AccountView } from "@/lib/mail/accounts";
import type { SavedDraft } from "@/lib/mail/drafts";
import type { MoveReceipt } from "@/lib/mail/moves";
import type { MailboxInfo, Special } from "@/lib/mail/client";
import type { ClientNote, ThreadMeta } from "@/lib/mail/kca-data";
import type { ConversationRow } from "@/lib/mail/conversations";
import { matchIndex, bookingHref, clientsFrom, conversationKey, metaFor, partyOf } from "@/lib/mail/kca";
import { messageIdentity } from "@/lib/mail/status";
import ConnectMailbox from "./ConnectMailbox";
import MailCompose, {type Draft, type MailComposeHandle} from "./MailCompose";
import MailList, {listGroups, rowKey} from "./MailList";
import MailReader, {type ReplyKind} from "./MailReader";
import MailSettings from "./MailSettings";
import MailIcon, {KcaMark, type MailIconName} from "./MailIcon";
import MailTheme from "./MailTheme";
import { mailRequest } from "./mail-request";
import { avatarTone, checkedAgo, initials, listTime, quoteBlock, replyRecipients, replySubject, senderName, shortWhen, splitAddresses } from "./mail-format";
import { ClientsView, Inspector, MorningBrief, TemplatesView, type FollowUpResult, type WaitingResult, type Workspace } from "./KcaPanels";
import { MailModal, SearchPalette, ShortcutsSheet, useConfirm, type ModalHandle, type PaletteItem } from "./MailOverlay";
import { shortcut } from "./shortcuts";
import { UNDO_MS } from "./send-hold";
import { Motion, withMotion, type MotionType } from "./motion";
import BookingHero from "./BookingHero";
import MailGate from "./MailGate";
const PRIMARY=["Today","Inbox","Assigned","Snoozed","Drafts","Sent","Starred"] as const,LIBRARY=["Clients","Templates","Archive","Spam","Bin"] as const;
const SIDE_KEY="kca-mail-side";
const RAIL=[["Today","sun"],["Inbox","inbox"],["Assigned","assigned"],["Snoozed","snooze"],["Drafts","drafts"],["Sent","sent"],["Archive","archive"],["Clients","clients"],["Templates","templates"],["Starred","star"],["Spam","spam"],["Bin","trash"]] as const;
type View=typeof RAIL[number][0]|"Mailboxes";
/** What the reader says in a folder before a conversation is opened. The Inbox shows the Morning brief instead. */
const IDLE:Partial<Record<View,[string,string]>>={
  Assigned:["Assigned to you","Conversations land here when someone on the team assigns them to you. Open one to read it."],
  Snoozed:["Snoozed mail","Snoozed conversations return to the top of the inbox at the time you picked, or sooner if the client replies."],
  Drafts:["Your drafts","Pick a draft to carry on writing."],
  Sent:["Sent mail","Open an email you sent to see the whole conversation."],
  Starred:["Starred","Conversations stay here until you remove the star."],
  Archive:["Archive","Archived mail stays searchable. Open a conversation and use Move to inbox to bring it back."],
  Spam:["Spam","Open a message to check it. If it is genuine, use Move to inbox."],
  Bin:["Bin","Open a message and use Move to inbox to restore it."],
};
const SPECIAL:Partial<Record<View,Special>>={Inbox:"inbox",Snoozed:"inbox",Sent:"sent",Archive:"archive",Spam:"spam",Bin:"trash"};
const MOVES=["archive","trash","spam","inbox"] as const;
type Move=typeof MOVES[number];
type Picked={accountId:string;row:MessageRow};
type MailScope={accountId:string;view:View;folder:string;search:string;filter:string};
type MailPage={scope:MailScope;items:ConversationRow[];total:number;error:string|null};
type Toast={id:number;text:string;accessible?:string;undo?:()=>void|Promise<void>};
const newestFirst=(a:MessageRow,b:MessageRow)=>(b.date??"").localeCompare(a.date??"");
const WEEK=7*86_400_000;
const daysFromNow=(days:number)=>new Date(Date.now()+days*86_400_000).toISOString();
export default function MailDesk({initialAccounts,initialQuery,demo=false,me="",initialView="Inbox"}:{initialAccounts:AccountView[];initialQuery:string;demo?:boolean;me?:string;initialView?:View}) {
  const [accounts,setAccounts]=useState(initialAccounts),[accountId,setAccountId]=useState(initialAccounts[0]?.id??""),[view,setView]=useState<View>(initialView);
  const [boxes,setBoxes]=useState<MailboxInfo[]>([]),[workspace,setWorkspace]=useState<Workspace|null>(null),[workspaceError,setWorkspaceError]=useState("");
  const [page,setPage]=useState<MailPage|null>(null),[tick,setTick]=useState(0);
  const [waiting,setWaiting]=useState<WaitingResult|null>(null),[followUps,setFollowUps]=useState<FollowUpResult|null>(null),[unread,setUnread]=useState(initialAccounts[0]?.last_unread_count??0),[checking,setChecking]=useState(true),[syncError,setSyncError]=useState("");
  const [picked,setPicked]=useState<Picked|null>(null),[thread,setThread]=useState<{messages:ThreadMessage[];loading:boolean;error:string|null}>({messages:[],loading:false,error:null});
  const [saved,setSaved]=useState<SavedDraft[]>([]),[draftsState,setDraftsState]=useState<{loading:boolean;error:string|null}>({loading:true,error:null}),[draftsTick,setDraftsTick]=useState(0);
  const [filter,setFilter]=useState("all"),[search,setSearch]=useState(initialQuery),[selectedKeys,setSelectedKeys]=useState<string[]>([]);
  const [clientId,setClientId]=useState(""),[inspector,setInspector]=useState(false),[briefOpen,setBriefOpen]=useState(false),[palette,setPalette]=useState(false),[help,setHelp]=useState(false);
  const [draft,setDraft]=useState<Draft|null>(null),[toast,setToast]=useState<Toast|null>(null),[busy,setBusy]=useState(false),[clock,setClock]=useState(()=>Date.now());
  const [signingOut, startSignOut] = useTransition();
  const [collapsed,setCollapsed]=useState(false),[narrow,setNarrow]=useState(false),[phone,setPhone]=useState(false),[drawerOpen,setDrawerOpen]=useState(false);
  const [confirmDialog,ask]=useConfirm();
  const composeModal=useRef<ModalHandle>(null);
  const compose=useRef<MailComposeHandle>(null),afterClose=useRef<(()=>void)|null>(null),openSequence=useRef(0),listVersion=useRef(0),mutation=useRef(false),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null),anchor=useRef<string|null>(null),known=useRef({unread,accountId});
  const account=accounts.find((a)=>a.id===accountId),selected=picked?.row??null,special=SPECIAL[view]??"inbox";
  const folder=view==="Starred"?"__starred__":boxes.find((b)=>b.special===special)?.path??(special==="inbox"?"INBOX":"");
  const nonMail=["Today","Clients","Templates","Mailboxes"].includes(view),fullWork=nonMail||view==="Drafts",setup=!accounts.length;
  const scope=useMemo<MailScope>(()=>({accountId,view,folder,search,filter}),[accountId,view,folder,search,filter]);
  const loading=page?.scope!==scope;
  const list=page?.scope===scope?page:{items:[],total:0,error:null};
  const showInspector = selected && inspector && workspace && !thread.loading;
  useEffect(()=>{
    try{if(localStorage.getItem(SIDE_KEY)==="collapsed")queueMicrotask(()=>setCollapsed(true));}catch{}
    const small=typeof matchMedia==="function"?matchMedia("(max-width: 1100px)"):null;
    const mobile=typeof matchMedia==="function"?matchMedia("(max-width: 720px)"):null;
    const fit=()=>{setNarrow(!!small?.matches);const isPhone=!!mobile?.matches;setPhone(isPhone);if(!isPhone)setDrawerOpen(false);};
    fit();
    small?.addEventListener?.("change",fit);
    mobile?.addEventListener?.("change",fit);
    return()=>{small?.removeEventListener?.("change",fit);mobile?.removeEventListener?.("change",fit);};
  },[]);
  // Close any open dropdown menu when clicking outside it.
  useEffect(()=>{
    const outside=(e:PointerEvent)=>{
      const target=e.target as Element|null;
      for(const menu of document.querySelectorAll(".mail-app .menu-wrap[open]")){
        if(!target||!menu.contains(target))menu.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[]);
  function toggleSide(){
    if(phone){setDrawerOpen((v)=>!v);return;}
    setCollapsed((was)=>{const next=!was;try{if(next)localStorage.setItem(SIDE_KEY,"collapsed");else localStorage.removeItem(SIDE_KEY);}catch{}return next;});
  }
  useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30_000);return()=>clearInterval(timer);},[]);
  function notify(text:string,undo?:Toast["undo"],accessible?:string) {
    if(toastTimer.current)clearTimeout(toastTimer.current);
    const id=(toast?.id??0)+1;setToast({id,text,undo,accessible});
    toastTimer.current=setTimeout(()=>setToast((old)=>old?.id===id?null:old),UNDO_MS);
  }
  async function undo() {const action=toast?.undo;if(!action)return;if(toastTimer.current)clearTimeout(toastTimer.current);setToast(null);try{await action();notify("Undone");setTick((n)=>n+1);}catch(e){notify(e instanceof Error?e.message:"Undo failed. The message has been left where it is.");}}
  function closeDraft(){setDraft(null);setDraftsTick((n)=>n+1);const next=afterClose.current;afterClose.current=null;next?.();}
  /** New email sits in a dialog: let it shrink away first, once the draft has really closed. */
  const afterModal=(fn:()=>void)=>{const m=composeModal.current;if(m)void m.leave().then(fn);else fn();};
  function closeReader(){withMotion("mail-close",()=>{setPicked(null);setBriefOpen(false);openSequence.current++;});}
  function withDraftClosed(fn:()=>void){if(draft){afterClose.current=fn;compose.current?.close();}else fn();}
  function navigate(next:View,nextFilter="all"){setDrawerOpen(false);withDraftClosed(()=>withMotion("mail-view",()=>{openSequence.current++;setPicked(null);setView(next);setFilter(nextFilter);setSearch("");setSelectedKeys([]);setBriefOpen(false);}));}
  function selectMailbox(id:string) {
    if (id === accountId) return;
    setAccountId(id); setBoxes([]); setSelectedKeys([]); setSaved([]); setDraftsState({loading:true,error:null}); setWorkspace(null); setWorkspaceError(""); setSyncError("");
    setUnread(accounts.find((a)=>a.id===id)?.last_unread_count ?? 0); setChecking(true);
  }
  function changeAccount(id:string){setDrawerOpen(false);withDraftClosed(()=>withMotion("mail-view",()=>{openSequence.current++;setPicked(null);selectMailbox(id);setView("Inbox");setSearch("");setFilter("all");setSelectedKeys([]);}));}
  function updatedAccounts(rows:AccountView[]){setAccounts(rows);if(!rows.some((a)=>a.id===accountId)){openSequence.current++;selectMailbox(rows[0]?.id??"");setPicked(null);}setTick((n)=>n+1);}

  /* Loading */
  useEffect(()=>{
    if(!accountId)return;let live=true;
    void mailRequest(mailWorkspace(accountId)).then((r)=>{if(!live)return;if(r.ok){setWorkspace(r.data);setWorkspaceError("");}else{setWorkspace(null);setWorkspaceError(r.error);}});
    return()=>{live=false;};
  },[accountId,tick]);
  useEffect(()=>{if(!accountId)return;let live=true;queueMicrotask(()=>{if(live)setChecking(true);});
    void mailRequest(mailFolders(accountId)).then((r)=>{if(!live)return;setChecking(false);if(r.ok){const checked=new Date().toISOString();setBoxes(r.data.boxes);setUnread(r.data.unread);setSyncError("");setAccounts((rows)=>rows.map((a)=>a.id===accountId?{...a,last_synced_at:checked,last_unread_count:r.data.unread,last_error:null}:a));}else setSyncError(r.error);});
    return()=>{live=false;};
  },[accountId,tick]);
  useEffect(()=>{if(!accountId)return;let live=true;void mailRequest(mailWaiting()).then((r)=>{if(live)setWaiting(r);});void mailRequest(mailFollowUps()).then((r)=>{if(live)setFollowUps(r);});return()=>{live=false;};},[accountId,tick]);
  // Drafts are read on their own, so the list can mark conversations with a draft and a reply can resume one.
  useEffect(()=>{if(!accountId)return;let live=true;void mailRequest(mailDrafts(accountId)).then((r)=>{if(!live)return;if(r.ok)setSaved(r.data);setDraftsState({loading:false,error:r.ok?null:r.error});});return()=>{live=false;};},[accountId,tick,draftsTick]);
  useEffect(()=>{
    if(!scope.accountId||nonMail||scope.view==="Drafts")return;
    let live=true;
    const version=++listVersion.current;
    const empty:MailPage={scope,items:[],total:0,error:null};
    async function load() {
      if(scope.view==="Assigned"){
        const r=await mailRequest(mailAssigned());
        if(live&&listVersion.current===version)setPage(r.ok?{scope,items:r.data.items,total:r.data.items.length,error:r.data.errors.join(" ")||(r.data.partial?"Some conversations could not be read. Results are partial.":null)}:{...empty,error:r.error});
      }else if(scope.folder){
        const r=await mailRequest(mailList(scope.accountId,scope.folder,{text:scope.search,unread:scope.filter==="unread",flagged:scope.view==="Starred"||scope.filter==="starred"}));
        if(live&&listVersion.current===version)setPage(r.ok?{scope,total:r.data.total,items:r.data.items.map((row)=>({...row,accountId:scope.accountId})),error:null}:{...empty,error:r.error});
      }
    }
    void load();
    return()=>{live=false;};
  },[scope,tick,nonMail]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible")setTick((n)=>n+1);};const timer=setInterval(refresh,120000);document.addEventListener("visibilitychange",refresh);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};},[]);
  // The background check updates every mailbox every 5 minutes. Reading its result is cheap, so a hidden tab
  // keeps its title count current, and a visible one reloads when new mail has arrived.
  useEffect(()=>{known.current={unread,accountId};},[unread,accountId]);
  useEffect(()=>{
    const poll=()=>void mailRequest(mailStatus()).then((r)=>{
      if(!r.ok)return;
      setAccounts((rows)=>rows.map((a)=>{const fresh=r.data.find((x)=>x.id===a.id);return fresh?{...a,...fresh}:a;}));
      const mine=r.data.find((a)=>a.id===known.current.accountId);
      if(mine&&(mine.last_unread_count??0)>known.current.unread&&document.visibilityState==="visible")setTick((n)=>n+1);
    });
    const timer=setInterval(poll,60_000);return()=>clearInterval(timer);
  },[]);
  const totalUnread=accounts.reduce((sum,a)=>sum+(a.id===accountId?unread:(a.last_unread_count??0)),0);
  // Next streams the page title in after hydration, so the count is put back whenever the title changes.
  useEffect(()=>{
    const apply=()=>{const base=document.title.replace(/^\(\d+\)\s+/,""),title=totalUnread>0?`(${totalUnread}) ${base}`:base;if(document.title!==title)document.title=title;};
    apply();const watch=new MutationObserver(apply);watch.observe(document.head,{childList:true,subtree:true,characterData:true});
    return()=>watch.disconnect();
  },[totalUnread]);

  /* Conversations */
  const rowAccount=(row:MessageRow)=>(row as ConversationRow).accountId||accountId;
  const accountEmail=(id:string)=>accounts.find((a)=>a.id===id)?.email??"";
  const rowParty=(row:MessageRow)=>partyOf(row,accountEmail(rowAccount(row)));
  const conversation=(row:MessageRow)=>rowAccount(row)+":"+conversationKey(row.subject,rowParty(row));
  const sameConversation=(a:MessageRow,b:MessageRow)=>conversation(a)===conversation(b);
  const metaOf=(row:MessageRow):ThreadMeta|undefined=>workspace&&rowAccount(row)===accountId?metaFor(workspace.meta,row.subject,rowParty(row)):undefined;
  const fromMe=(row:MessageRow)=>row.from.address.toLowerCase()===accountEmail(rowAccount(row)).toLowerCase();
  // Snoozed until a later time, unless the other party has written since it was snoozed.
  const snoozedUntil=(row:MessageRow)=>{const m=metaOf(row);if(!m?.snoozed_until||Date.parse(m.snoozed_until)<=clock)return null;if(!fromMe(row)&&row.date&&row.date>m.updated_at)return null;return m.snoozed_until;};
  const returned=(row:MessageRow)=>{const m=metaOf(row);if(!m?.snoozed_until)return false;const at=Date.parse(m.snoozed_until);return at<=clock&&clock-at<WEEK;};
  const snoozedCount=workspace?.meta.filter((m)=>m.snoozed_until&&Date.parse(m.snoozed_until)>clock).length??0;
  const waitRows=waiting?.ok?waiting.data.items:[],quietRows=followUps?.ok?followUps.data.items:[];
  const waits=(row:MessageRow)=>waitRows.some((w)=>w.accountId===rowAccount(row)&&w.mailbox===row.mailbox&&w.uid===row.uid);
  const inbox=view==="Inbox";
  const visibleItems=list.items.filter((r)=>view==="Snoozed"?!!snoozedUntil(r):(filter!=="waiting"||waits(r))&&(filter!=="unread"||!r.seen)&&(filter!=="starred"||r.flagged)&&(!inbox||(filter==="snoozed")===!!snoozedUntil(r)));
  const waitingKeys=new Set(visibleItems.filter(waits).map(rowKey));
  // J, K and "open the next waiting one" follow the list exactly as it is shown: one row per conversation, in its groups.
  const conversations=listGroups(visibleItems,{inbox,waitingKeys,party:rowParty,returned,now:new Date(clock)}).flatMap(([,rows])=>rows);
  // A draft's conversation: its subject and first outside recipient, in its mailbox.
  const draftKey=(d:SavedDraft)=>d.mailbox_id+":"+conversationKey(d.data.subject,partyOf({from:[],to:splitAddresses(d.data.to).map((address)=>({address}))},accountEmail(d.mailbox_id)));
  const draftKeys=new Set(saved.filter((d)=>d.send_state==="draft").map(draftKey));
  const emptyList=search?{title:`Nothing in ${view} matches “${search}”`,detail:"Check the spelling, or clear the search to see everything."}
    :filter==="unread"?{title:"No unread conversations"}:filter==="waiting"?{title:"Nobody is waiting on a reply"}:filter==="starred"?{title:"No starred conversations"}
    :filter==="snoozed"||view==="Snoozed"?{title:"Nothing is snoozed",detail:"Snooze a conversation from its toolbar to hide it until later."}
    :inbox?{title:"Inbox is clear",detail:"New mail appears here. Mail is checked every 2 minutes while this page is open."}
    :view==="Assigned"?{title:"Nothing is assigned to you",detail:"Assign a conversation from its toolbar or the client panel."}:{title:`${view} is empty`};
  const directory=workspace?.directory,links=workspace?.links;
  const findMatch=useMemo(()=>directory?matchIndex(directory,links):null,[directory,links]);
  const match=useMemo(()=>findMatch?.({subject:thread.messages.map((m)=>m.subject).join("\n")||selected?.subject||"",text:thread.messages.map((m)=>m.text).join("\n"),html:thread.messages.map((m)=>m.html??"").join("\n"),addresses:thread.messages.length?thread.messages.flatMap((m)=>[...m.from,...m.to,...m.cc].map((a)=>a.address)):selected?[selected.from.address,...selected.to.map((a)=>a.address),...(selected.cc??[]).map((a)=>a.address)]:[]})??{client:null,booking:null,by:null},[findMatch,selected,thread.messages]);
  const selectedMeta=selected?metaOf(selected):undefined;
  const heroShown=!!(match.booking&&workspace?.directory);
  const latest=selected?thread.messages.at(-1):undefined,done=!!latest&&selectedMeta?.done_message_id===messageIdentity(latest);
  const noReply=!!selected&&quietRows.some((r)=>sameConversation(r,selected));
  const newEmailPrimary = !!account && !draft && !(selected && latest) && !(view === "Clients" && clientId);
  const rowContext = (row: MessageRow) => {
    const hit = findMatch?.({ subject: row.subject, text: row.snippet, addresses: [row.from.address, ...row.to.map((a) => a.address)] });
    if (!hit?.client && !hit?.booking) return null;
    return { business: hit.client?.advertiser.business, stage: hit.booking?.status, priceKes: hit.booking?.priceKes };
  };
  function patchMeta(row:ThreadMeta){setWorkspace((w)=>w?{...w,meta:[...w.meta.filter((m)=>m.thread_key!==row.thread_key),row]}:w);}

  /* Opening and replying */
  async function openRaw(row:MessageRow,replyNow=false,motion:MotionType="mail-open"){
    const id=rowAccount(row),sequence=++openSequence.current,openScope=scope;
    withMotion(motion,()=>{selectMailbox(id);if(nonMail||view==="Drafts")setView("Inbox");setPicked({accountId:id,row});setBriefOpen(false);setDraft(null);setThread({messages:[],loading:true,error:null});});
    if(returned(row)){const p=rowParty(row);void mailRequest(mailSnooze(id,row.subject,p,null)).then((r)=>{if(r.ok)patchMeta(r.data);});}
    const r=await mailRequest(mailThread(id,row.mailbox,row.uid,row.subject));if(sequence!==openSequence.current)return;
    withMotion("mail-loaded",()=>{
      setThread(r.ok?{messages:r.data,loading:false,error:null}:{messages:[],loading:false,error:r.error});
      if(!r.ok)return;
      setPicked({accountId:id,row:{...row,seen:true}});
      if(!row.seen&&row.mailbox===(boxes.find((b)=>b.special==="inbox")?.path??"INBOX")&&id===accountId)setUnread((n)=>Math.max(0,n-1));
      setPage((old)=>old?.scope===openScope?{...old,items:old.items.map((m)=>rowAccount(m)===id&&m.uid===row.uid&&m.mailbox===row.mailbox?{...m,seen:true}:m)}:old);
    });
    if(r.ok){
      if(replyNow&&r.data.length)reply("reply",r.data.at(-1)!,"",id);
    }
  }
  function open(row:MessageRow,replyNow=false,motion:MotionType="mail-open"){withDraftClosed(()=>{void openRaw(row,replyNow,motion);});}
  function draftFor(kind:ReplyKind,m:ThreadMessage,id=accountId):Draft {
    const recipients = replyRecipients(kind, m, accountEmail(id));
    return {title:kind==="forward"?"Forward":kind==="replyAll"?"Reply all":"Reply",...recipients,subject:replySubject(m.subject,kind==="forward"?"forward":"reply"),quoted:quoteBlock(m),inReplyTo:kind==="forward"?null:m.messageId,references:kind==="forward"?[]:[...m.references,...(m.messageId?[m.messageId]:[])].slice(-20),answers:kind==="forward"?undefined:{mailbox:m.mailbox,uid:m.uid}};
  }
  /** A saved draft for this conversation, so a second R continues it instead of starting over. */
  function savedReply(kind:ReplyKind,m:ThreadMessage,id=accountId){
    const key=id+":"+conversationKey(m.subject,partyOf(m,accountEmail(id)));
    return saved.find((d)=>d.send_state==="draft"&&(kind==="forward")===(d.data.title==="Forward")&&draftKey(d)===key);
  }
  function reply(kind:ReplyKind,m:ThreadMessage,text="",id=picked?.accountId??accountId){
    if(draft){compose.current?.insert(text);return;}
    selectMailbox(id);
    const resume=savedReply(kind,m,id);
    if(resume){setDraft({...resume.data,saved:resume,body:text?[resume.data.body.trimEnd(),text].filter(Boolean).join("\n\n"):resume.data.body});return;}
    setDraft({...draftFor(kind,m,id),body:text});
  }
  function replyText(text:string){if(draft)compose.current?.insert(text);else if(latest)reply("reply",latest,text);}
  function nextWaiting(row:MessageRow){const at=conversations.findIndex((r)=>sameConversation(r,row));return [...conversations.slice(at+1),...conversations.slice(0,Math.max(0,at))].find((r)=>!sameConversation(r,row)&&waits(r));}
  function leave(row:MessageRow){const next=nextWaiting(row);if(next)void openRaw(next);else{setPicked(null);openSequence.current++;}return next;}

  /* Acting on conversations. The list changes at once; the mail server catches up, and a failure puts it back. */
  function patchRows(hit:(r:MessageRow)=>boolean,patch:Partial<MessageRow>,targetScope=scope){
    setPage((old)=>old?.scope===targetScope?{...old,items:old.items.map((r)=>hit(r)?{...r,...patch}:r)}:old);
    setPicked((p)=>p&&hit(p.row)?{...p,row:{...p.row,...patch}}:p);
  }
  async function moveConversation(row:MessageRow,action:Move){
    const id=rowAccount(row),moveScope=scope,inConversation=(r:MessageRow)=>sameConversation(r,row)&&r.mailbox===row.mailbox;
    const isOpen=!!selected&&picked?.accountId===id&&sameConversation(selected,row);
    const removed=list.items.filter(inConversation);
    const uids=[...new Set([row.uid,...removed.map((r)=>r.uid),...(isOpen?thread.messages.filter((m)=>m.mailbox===row.mailbox).map((m)=>m.uid):[])])];
    setPage((old)=>old?.scope===moveScope?{...old,items:old.items.filter((r)=>!inConversation(r)),total:Math.max(0,old.total-removed.length)}:old);
    setSelectedKeys((keys)=>keys.filter((key)=>!removed.some((r)=>rowKey(r)===key)));
    const next=isOpen?leave(row):undefined;
    const pending=mailRequest(mailMove(id,row.mailbox,uids,action));
    const label=action==="archive"?next?"Archived. Opened the next waiting conversation.":"Archived":action==="trash"?"Moved to Bin":action==="spam"?"Moved to Spam":"Moved to Inbox";
    notify(label,async()=>{
      const moved=await pending;if(!moved.ok)return;
      const result=await mailRequest(mailUndoMove(moved.data));if(!result.ok)throw new Error(result.error);
      const restored=await mailRequest(mailList(id,row.mailbox,{text:row.subject}));
      if(restored.ok){const hit=restored.data.items.find((m)=>m.messageId===row.messageId)||restored.data.items.find((m)=>sameConversation({...m,accountId:id} as ConversationRow,row));if(hit)void openRaw({...hit,accountId:id} as ConversationRow);}
    });
    const moved=await pending;
    if(!moved.ok){setPage((old)=>old?.scope===moveScope?{...old,items:[...old.items,...removed.filter((r)=>!old.items.some((x)=>rowKey(x)===rowKey(r)))].sort(newestFirst),total:old.total+removed.length}:old);notify(moved.error);return;}
    setTick((n)=>n+1);
  }
  async function actRow(row:MessageRow,action:MailAction){
    if((MOVES as readonly string[]).includes(action))return moveConversation(row,action as Move);
    const id=rowAccount(row),actScope=scope,hit=(r:MessageRow)=>rowAccount(r)===id&&r.mailbox===row.mailbox&&r.uid===row.uid;
    const patch:Partial<MessageRow>=action==="star"?{flagged:true}:action==="unstar"?{flagged:false}:{seen:action==="read"};
    const before:Partial<MessageRow>={flagged:row.flagged,seen:row.seen},inInbox=row.mailbox===(boxes.find((b)=>b.special==="inbox")?.path??"INBOX")&&id===accountId;
    const change=action==="unread"&&row.seen?1:action==="read"&&!row.seen?-1:0;
    patchRows(hit,patch,actScope);if(inInbox&&change)setUnread((n)=>Math.max(0,n+change));
    const r=await mailRequest(mailAct(id,row.mailbox,[row.uid],action));
    if(!r.ok){patchRows(hit,before,actScope);if(inInbox&&change)setUnread((n)=>Math.max(0,n-change));notify(r.error);return;}
    notify(action==="unread"?"Marked unread":action==="star"?"Starred":action==="unstar"?"Star removed":"Marked read");
  }
  async function markDone(){
    if(!selected||mutation.current)return;mutation.current=true;const row=selected,id=picked!.accountId;
    leave(row);
    try{
      const r=await mailRequest(mailDone(id,row.mailbox,row.uid,row.subject));if(!r.ok){notify(r.error);return;}
      patchMeta(r.data);
      notify("Marked done",async()=>{const result=await mailRequest(mailUndoDone(id,row.subject,r.data.done_message_id!,r.data.party));if(!result.ok)throw new Error(result.error);void openRaw({...row,accountId:id} as ConversationRow);});setTick((n)=>n+1);
    }finally{mutation.current=false;}
  }
  async function snooze(row:MessageRow,until:string|null){
    const id=rowAccount(row),p=rowParty(row),key=conversationKey(row.subject,p),previous=metaOf(row);
    const provisional:ThreadMeta={mailbox_id:id,thread_key:key,assigned_email:previous?.assigned_email??null,...previous,snoozed_until:until,updated_at:new Date().toISOString()};
    patchMeta(provisional);
    if(until&&selected&&sameConversation(selected,row))leave(row);
    const r=await mailRequest(mailSnooze(id,row.subject,p,until));
    if(!r.ok){if(previous)patchMeta(previous);else setWorkspace((w)=>w?{...w,meta:w.meta.filter((m)=>m.thread_key!==key)}:w);notify(r.error);return;}
    patchMeta(r.data);
    if(until)notify(`Snoozed until ${shortWhen(until)}`,async()=>{const back=await mailRequest(mailSnooze(id,row.subject,p,null));if(!back.ok)throw new Error(back.error);patchMeta(back.data);});
    else notify("Back in your inbox");
  }
  async function assignConversation(row:MessageRow,email:string|null){
    const id=rowAccount(row),p=rowParty(row);
    const r=await mailRequest(mailAssign(id,row.subject,email,p));
    if(!r.ok){notify(r.error);return;}
    patchMeta(r.data);
    const name=workspace?.people.find((person)=>person.email===email)?.name??email;
    notify(email?`Assigned to ${name}`:"Unassigned");
    setTick((n)=>n+1);
  }
  async function remind(row:MessageRow,days:number|null){
    const id=rowAccount(row),at=days?daysFromNow(days):null;
    const r=await mailRequest(mailRemind(id,row.subject,rowParty(row),at));
    if(!r.ok){notify(r.error);return;}
    patchMeta(r.data);
    if(!at)setFollowUps((f)=>f?.ok?{...f,data:{...f.data,items:f.data.items.filter((x)=>!sameConversation(x,row))}}:f);
    notify(at?`If nobody replies by ${shortWhen(at)}, it is listed under No reply yet.`:"Reminder cancelled");
  }
  function select(row:MessageRow,range:boolean){
    const key=rowKey(row),keys=conversations.map(rowKey),from=anchor.current?keys.indexOf(anchor.current):-1,to=keys.indexOf(key);
    if(range&&from>=0&&to>=0){const [a,b]=from<to?[from,to]:[to,from];setSelectedKeys((old)=>[...new Set([...old,...keys.slice(a,b+1)])]);return;}
    anchor.current=key;
    setSelectedKeys((old)=>old.includes(key)?old.filter((k)=>k!==key):[...old,key]);
  }
  async function bulk(action:"archive"|"read"){
    if(mutation.current)return;mutation.current=true;setBusy(true);
    const bulkScope=scope,sequence=openSequence.current;
    const chosen=conversations.filter((r)=>selectedKeys.includes(rowKey(r)));
    // Every message of each chosen conversation, so no older message is left behind to take its place.
    const rows=list.items.filter((r)=>chosen.some((c)=>sameConversation(c,r)&&c.mailbox===r.mailbox));
    const groups=new Map<string,{id:string;folder:string;rows:ConversationRow[]}>();
    for(const row of rows){const id=rowAccount(row),key=id+":"+row.mailbox;const g=groups.get(key)??{id,folder:row.mailbox,rows:[]};g.rows.push(row);groups.set(key,g);}
    if(action==="archive")setPage((old)=>old?.scope===bulkScope?{...old,items:old.items.filter((r)=>!rows.includes(r)),total:Math.max(0,old.total-rows.length)}:old);else patchRows((r)=>rows.includes(r as ConversationRow),{seen:true},bulkScope);
    if(selected&&chosen.some((c)=>sameConversation(c,selected))&&action==="archive"){setPicked(null);openSequence.current++;}
    setSelectedKeys([]);
    const receipts:MoveReceipt[]=[],failed:ConversationRow[]=[];
    try{
      for(const g of groups.values()){
        const r=action==="archive"?await mailRequest(mailMove(g.id,g.folder,g.rows.map((r)=>r.uid),"archive")):await mailRequest(mailAct(g.id,g.folder,g.rows.map((r)=>r.uid),"read"));
        if(!r.ok)failed.push(...g.rows);else if(action==="archive")receipts.push(r.data as MoveReceipt);
      }
      if(failed.length){
        if(action==="archive")setPage((old)=>old?.scope===bulkScope?{...old,items:[...old.items,...failed].sort(newestFirst),total:old.total+failed.length}:old);
        if(openSequence.current===sequence)setSelectedKeys(chosen.filter((c)=>failed.some((f)=>sameConversation(f,c))).map(rowKey));
      }
      notify(failed.length?`${failed.length} messages could not be updated. They stay selected.`:action==="archive"?`${chosen.length} conversation${chosen.length===1?"":"s"} archived`:"Marked read",receipts.length?async()=>{let errors=0;for(const receipt of receipts){const r=await mailRequest(mailUndoMove(receipt));if(!r.ok)errors++;}if(errors)throw new Error(`Undo failed for ${errors} move${errors===1?"":"s"}. Other moves were restored.`);}:undefined);
      setTick((n)=>n+1);
    }finally{mutation.current=false;setBusy(false);}
  }
  async function more(){
    if(busy||loading)return;
    const loadScope=scope,version=listVersion.current;
    setBusy(true);
    const r=await mailRequest(mailList(loadScope.accountId,loadScope.folder,{text:loadScope.search,unread:loadScope.filter==="unread",flagged:loadScope.view==="Starred"||loadScope.filter==="starred"},list.items.length));
    setBusy(false);
    setPage((old)=>{
      if(old?.scope!==loadScope||listVersion.current!==version)return old;
      if(!r.ok)return {...old,error:r.error};
      const keys=new Set(old.items.map(rowKey));
      const rows=r.data.items.map((row)=>({...row,accountId:loadScope.accountId})).filter((row)=>!keys.has(rowKey(row)));
      return {...old,items:[...old.items,...rows],total:r.data.total,error:null};
    });
  }
  async function deleteSaved(d:SavedDraft){
    if(d.data.uploadIds.length&&!await ask({title:"Delete this draft?",text:"Its attachments are deleted too and cannot be restored.",action:"Delete draft"}))return;
    setSaved((rows)=>rows.filter((x)=>x.id!==d.id));
    const r=await mailRequest(mailDeleteDraft(d.id,d.row_version));
    if(!r.ok){setSaved((rows)=>[d,...rows]);notify(r.error);return;}
    notify("Draft deleted",d.data.uploadIds.length?undefined:async()=>{const back=await mailRequest(mailSaveDraft(d.id,d.mailbox_id,0,d.data));if(!back.ok)throw new Error(back.error);setDraftsTick((n)=>n+1);});
  }
  function saveNote(note:ClientNote){setWorkspace((w)=>w?{...w,notes:[...w.notes.filter((n)=>n.advertiser_email!==note.advertiser_email),note]}:w);}
  function newEmail(email=""){setDrawerOpen(false);withDraftClosed(()=>setDraft({title:"New email",to:email,cc:"",subject:""}));}

  /* Keyboard */
  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{
      if(palette||help)return;
      const key=shortcut(e);if(!key)return;
      if(key==="search"){e.preventDefault();setPalette(true);return;}if(key==="help"){e.preventDefault();setHelp(true);return;}if(key==="undo"){e.preventDefault();void undo();return;}
      if(key==="compose"&&account&&!draft){e.preventDefault();newEmail();return;}
      if(key==="escape"){
        const menu=document.querySelector('.mail-app .menu-wrap[open]');
        if(menu)menu.removeAttribute("open");
        else if(drawerOpen)setDrawerOpen(false);
        else if(draft)compose.current?.close();
        else if(selectedKeys.length)setSelectedKeys([]);
        else if(inspector)setInspector(false);
        else closeReader();
        return;
      }
      if(fullWork)return;
      const index=selected?conversations.findIndex((r)=>sameConversation(r,selected)):-1;
      if(key==="next"||key==="previous"){e.preventDefault();const row=conversations[Math.max(0,Math.min(conversations.length-1,index+(key==="next"?1:-1)))];if(row)open(row,false,"mail-step");return;}
      if(!selected)return;
      if(key==="select"){const row=conversations[index];if(row)select(row,false);return;}
      if(key==="snooze"&&inbox){e.preventDefault();const menu=document.querySelector<HTMLDetailsElement>(".mail-app .snooze-wrap");if(menu){menu.open=true;menu.querySelector<HTMLButtonElement>(".menu button")?.focus();}return;}
      if(key==="inspector")setInspector((v)=>!v);if(key==="archive"){e.preventDefault();void actRow(selected,"archive");}if(key==="done")void markDone();if(key==="star")void actRow(selected,selected.flagged?"unstar":"star");if(key==="unread")void actRow(selected,"unread");if(["reply","replyAll","forward"].includes(key)&&latest){e.preventDefault();reply(key as ReplyKind,latest);}
    };
    window.addEventListener("keydown",keydown);return()=>window.removeEventListener("keydown",keydown);
  });

  /* Search palette */
  const recent=[...waitRows,...quietRows,...list.items.map((row)=>({...row,accountId:rowAccount(row)}))].filter((r,i,all)=>all.findIndex((m)=>m.accountId===r.accountId&&m.mailbox===r.mailbox&&m.uid===r.uid)===i);
  const clients=workspace?.directory?clientsFrom(workspace.directory,workspace.links):[];
  const goTo=(path:string)=>{window.location.assign(path);};
  const paletteItems:PaletteItem[]=[
    ...recent.map((r)=>({id:`thread-${r.accountId}-${r.mailbox}-${r.uid}`,group:"Conversations",icon:"inbox" as const,label:r.subject,hint:senderName(r.from),row:r})),
    ...clients.map((c)=>({id:`client-${c.id}`,group:"Clients",icon:"clients" as const,label:c.advertiser.business,hint:c.advertiser.name,run:()=>{navigate("Clients");setClientId(c.id);}})),
    ...clients.flatMap((c)=>c.bookings.map((b)=>({id:`booking-${b.id}`,group:"Bookings",icon:"calendar" as const,label:`${b.reference} | ${c.advertiser.business}`,hint:b.status,run:()=>goTo(bookingHref(b))}))),
    ...accounts.map((a)=>({id:`mailbox-${a.id}`,group:"Mailboxes",icon:"inbox" as const,label:`Switch to ${a.email}`,hint:a.last_error??"",run:()=>changeAccount(a.id)})),
    {id:"view-Today",group:"Go to",icon:"sun" as const,label:"Today",hint:"View",run:()=>navigate("Today")},
    {id:"view-Inbox",group:"Go to",icon:"inbox" as const,label:"Inbox",hint:"View",run:()=>navigate("Inbox")},
    {id:"view-Clients",group:"Go to",icon:"clients" as const,label:"Clients",hint:"View",run:()=>navigate("Clients")},
    {id:"view-Templates",group:"Go to",icon:"templates" as const,label:"Templates",hint:"View",run:()=>navigate("Templates")},
    {id:"view-Mailboxes",group:"Go to",icon:"settings" as const,label:"Settings",hint:"View",run:()=>navigate("Mailboxes")},
    ...[["Overview",""],["Bookings","/bookings"],["Advert desk","/adverts"],["Schedule","/schedule"],["Settings","/settings"]].map(([label,path])=>({id:`manager-${path}`,group:"Manager",icon:"manager" as const,label:`Open ${label}`,hint:"/manage"+path,run:()=>goTo("/manage"+path)})),
    {id:"shortcuts",group:"Actions",icon:"key" as const,label:"Keyboard shortcuts",hint:"?",run:()=>setHelp(true)}
  ];

  /* Layout */
  const iconOnly=!phone&&(collapsed||narrow);
  const sideExpanded=phone?drawerOpen:!iconOnly;
  const sideToggleButton=<button type="button" className="side-toggle-btn" aria-expanded={sideExpanded} aria-label={sideExpanded?(phone?"Close sidebar":"Collapse sidebar"):(phone?"Open sidebar":"Expand sidebar")} title={sideExpanded?(phone?"Close sidebar":"Collapse sidebar"):(phone?"Open sidebar":"Expand sidebar")} onClick={toggleSide}><MailIcon name="sidebar" size="sm"/></button>;
  const badgeFor=(name:View)=>{
    if(name==="Inbox"&&unread>0)return <span className="badge">{unread}</span>;
    if(name==="Snoozed"&&snoozedCount>0)return <span className="badge quiet">{snoozedCount}</span>;
    if(name==="Drafts"&&saved.length>0)return <span className="badge quiet">{saved.length}</span>;
    if(name==="Clients"&&clients.length>0)return <span className="badge quiet">{clients.length}</span>;
    if(name==="Today"&&quietRows.length>0)return <span className="badge ember">{quietRows.length}</span>;
    return null;
  };
  const railItem=(name:View,icon:MailIconName)=><button type="button" key={name} className="rail-item" aria-current={view===name?"page":undefined} title={iconOnly?(name==="Mailboxes"?"Settings":name):undefined} onClick={()=>navigate(name)}><MailIcon name={icon} size="sm"/><span className="lbl">{name==="Mailboxes"?"Settings":name}</span>{badgeFor(name)}</button>;
  const replyAccountId=picked?.accountId??accountId;
  const composeView=draft&&account?<MailCompose ref={compose} key={draft.saved?.id??draft.subject+draft.title} accountId={accountId} from={account.email} draft={draft} signature={workspace?.signature} templates={workspace?.templates} clients={clients} modes={draft.title!=="New email"&&latest?{reply:draftFor("reply",latest,replyAccountId),replyAll:draftFor("replyAll",latest,replyAccountId),forward:draftFor("forward",latest,replyAccountId)}:undefined} onClose={()=>afterModal(closeDraft)} onHold={(cancel)=>notify("Sending in 5 seconds",cancel,"If this page closes before the hold ends, the saved message stays in Drafts unsent.")} onSent={()=>afterModal(()=>{setDraft(null);setDraftsTick((n)=>n+1);notify(demo?"Saved to sample Sent. No email was delivered.":"Sent");setTick((n)=>n+1);})}/>:null;
  const syncFailed=syncError||account?.last_error,checked=checkedAgo(account?.last_synced_at,new Date(clock));
  const filters=inbox?["all","unread","waiting","starred","snoozed"]:["Spam","Bin","Snoozed"].includes(view)?[]:["all","unread","starred"];
  const resumable=latest?savedReply("reply",latest,picked?.accountId):undefined;
  const icon=(name:View)=>RAIL.find(([n])=>n===name)![1];
  const signOutButton=<button type="button" className="signout-btn" disabled={signingOut} onClick={() => withDraftClosed(() => startSignOut(signOutOfMail))}><MailIcon name="signout" size="sm"/>{signingOut ? "Signing out..." : "Sign out"}</button>;
  const accountMenu=(where:"side"|"top")=><details className={`menu-wrap staff-account staff-account-${where}`}>
    <summary className="avatar-me" aria-label="Staff account and appearance" title={me}><span className="me-initials">{initials("", me)}</span>{where==="side"&&<><span className="me-text"><b>{me.split("@")[0]||"Staff"}</b><small>{account?.email??"No mailbox yet"}</small></span><MailIcon name="down" size="xs" className="me-chevron"/></>}</summary>
    <div className="menu">{me && <p className="staff-account-email">{me}</p>}<MailTheme/><hr/>{signOutButton}</div>
  </details>;
  // First run: no mailbox yet, so the desk has nothing to show. Setup gets the whole screen.
  if(setup)return <section className="mail-setup" aria-label="Set up mail"><h1 className="sr">Mail</h1><MailGate wide title="Welcome to Booking Desk." text="Connect the mailbox you answer from. You can add the team's other addresses later in Settings."
    points={[["lock","Your password is stored encrypted"],["refresh","Mail stays on your mail server and is read live"],["clients","Share an address with the colleagues who answer it"]]} corner={accountMenu("top")}>
    <ConnectMailbox first demo={demo} onConnected={(a)=>withMotion("mail-view",()=>updatedAccounts([a]))}/>
  </MailGate></section>;
  const folderAction = view==="Spam" ? { label:"Not spam", action:"inbox" as MailAction } : view==="Bin" ? { label:"Restore", action:"inbox" as MailAction } : undefined;
  return <section className={`app mail-shell ${drawerOpen?"drawer-open":""}`} data-side={iconOnly?"collapsed":"open"}>
    <h1 className="sr">Mail</h1>
    <button type="button" className="side-scrim" tabIndex={-1} aria-hidden="true" onClick={()=>setDrawerOpen(false)}/>
    <nav className="rail" aria-label="Mail navigation">
      <div className="side-head">
        <Link href="/mail" className="logo" aria-label="KCA Mail"><KcaMark/></Link>
        <span className="brand-text"><b>Booking Desk</b><small>Kwetu Connect staff</small></span>
        <button type="button" className="side-dismiss" aria-label="Close sidebar" onClick={()=>setDrawerOpen(false)}><MailIcon name="x" size="sm"/></button>
      </div>
      <button type="button" className={`side-new ${newEmailPrimary?"mg-primary":""}`} disabled={!account} aria-label="New email" title={iconOnly?"New email":undefined} onClick={()=>newEmail()}><MailIcon name="compose" size="sm"/><span>New email</span></button>
      <div className="rail-group">{PRIMARY.map((name)=>railItem(name,icon(name)))}</div>
      <p className="side-label">Library</p>
      <div className="rail-group">{LIBRARY.map((name)=>railItem(name,icon(name)))}</div>
      <div className="rail-spacer"/>
      <div className="rail-group">
        <Link href="/manage" className="rail-item" title={iconOnly?"Manager":undefined}><MailIcon name="manager" size="sm"/><span className="lbl">Manager</span></Link>
        {railItem("Mailboxes","settings")}
        <button type="button" className="rail-item" title={iconOnly?"Shortcuts":undefined} onClick={()=>{setDrawerOpen(false);setHelp(true);}} aria-label="Keyboard shortcuts"><MailIcon name="key" size="sm"/><span className="lbl">Shortcuts</span></button>
      </div>
      <div className="side-foot">
        {accountMenu("side")}
        {accounts.length>1&&<div className="side-boxes" role="group" aria-label="Switch mailbox">{accounts.map((a)=><button type="button" key={a.id} aria-pressed={a.id===accountId} title={a.email} onClick={()=>changeAccount(a.id)}><i/>{a.label&&a.label!==a.email?a.label:a.email.split("@")[0]}</button>)}</div>}
      </div>
    </nav>
    <Motion update={{"mail-view":"mail-view",default:"none"}} default="none"><div id="mail-work" className={`work ${fullWork?"full-work":""}`} data-insp={showInspector?"open":"closed"} data-view={selected||briefOpen?"reader":"list"} aria-busy={busy}>
      {view==="Today"?<MorningBrief full workspace={workspace} waiting={waiting} followUps={followUps} unread={totalUnread} mailboxCount={accounts.length} me={me} onOpen={open} onGo={(target,f)=>navigate(target as View,f??"all")} headerStart={sideToggleButton} onSearchPalette={()=>setPalette(true)}/>
      :view==="Mailboxes"?<MailSettings accounts={accounts} demo={demo} me={me} onAccounts={updatedAccounts} onSignature={(id,signature)=>{if(id===accountId)setWorkspace((w)=>w?{...w,signature}:w);}} headerStart={sideToggleButton} onSearchPalette={()=>setPalette(true)}/>
      :view==="Clients"?workspace?<ClientsView workspace={workspace} clientId={clientId} onClient={(id)=>withMotion("mail-open",()=>setClientId(id))} onNote={saveNote} onNew={newEmail} onOpen={open} headerStart={sideToggleButton} onSearchPalette={()=>setPalette(true)}/>:<div className="panel empty-state">{workspaceError||"Loading clients"}</div>
      :view==="Templates"?workspace?<TemplatesView templates={workspace.templates} onUpdated={()=>setTick((n)=>n+1)} headerStart={sideToggleButton} onSearchPalette={()=>setPalette(true)}/>:<div className="panel empty-state">{workspaceError||"Loading templates"}</div>
      :view==="Drafts"?<section className="panel main split-view" aria-label="Drafts">
        <header className="view-head">
          {sideToggleButton}
          <h1>Drafts <small>{saved.length} unsent</small></h1>
          <span className="vh-sp"/>
          <button type="button" className="vsearch" onClick={()=>setPalette(true)} aria-label="Search mail, clients and bookings"><MailIcon name="search" size="xs"/><span>Search mail, clients, bookings</span><kbd>/</kbd></button>
        </header>
        <div className="main-scroll"><div className="drafts-in">
          {draftsState.loading?<p className="muted">Loading drafts...</p>:draftsState.error?<p className="alert" role="alert">{draftsState.error}</p>:<div className="dgrid">
            {saved.map((r)=>(
              <article className="draft-card" key={r.id}>
                <div className="draft-to">
                  <span className="av" data-tone={avatarTone(r.data.to || r.data.subject || "D")}>{initials(r.data.to || "", r.data.to || "D")}</span>
                  <span>To <b>{r.data.to || "No recipient"}</b></span>
                  <span className="pill mute" style={{marginLeft:"auto"}}>{r.data.title==="New email"?"New":r.data.title}</span>
                </div>
                <h3>{r.data.subject || "(no subject)"}</h3>
                <p>{r.data.body.trim() || "Empty draft"}</p>
                {r.send_state!=="draft"&&<small className="draft-warn">Check Sent before sending again</small>}
                <div className="draft-foot">
                  <small className="mono">Saved {listTime(r.updated_at)}</small>
                  {r.send_state==="draft"&&<button type="button" className="btn ghost sm bad-btn" aria-label={`Delete draft ${r.data.subject||"with no subject"}`} onClick={()=>void deleteSaved(r)}><MailIcon name="trash" size="xs"/>Delete</button>}
                  <button type="button" className="btn gold sm" onClick={()=>withDraftClosed(()=>setDraft({...r.data,saved:r}))}>Resume</button>
                </div>
              </article>
            ))}
            <button type="button" className="draft-card draft-add" disabled={!account} onClick={()=>newEmail()}>
              <MailIcon name="compose"/>
              <b>New email</b>
              <span>Drafts save as you type</span>
            </button>
          </div>}
          {!!saved.length&&<p className="muted" style={{fontSize:"12.5px",marginTop:16}}>Your personal drafts in this app. Mail-server drafts stay on the mail server.</p>}
        </div></div>
      </section>
      :<>
      <section className="panel list" aria-label="Conversations">
        <div className="list-head">
          <div className="list-title">
            {sideToggleButton}
            <h1>{view==="Assigned"?"Assigned to you":view}</h1>
            <small className="lh-count">{conversations.length} {conversations.length===1?"conversation":"conversations"}</small>
            <button type="button" className="list-refresh" aria-busy={checking} title={checking?"Checking mail":syncFailed||`${checked[0].toUpperCase()}${checked.slice(1)}. Click to check now.`} aria-label="Refresh mailbox" onClick={()=>setTick((n)=>n+1)}><i className={`dot ${syncFailed?"warn":""}`}/><MailIcon name="refresh" size="xs"/></button>
          </div>
          <div className="list-meta-row">
            <label className="mb-switch"><span className="sr">Mailbox</span><select aria-label="Mailbox" value={accountId} onChange={(e)=>changeAccount(e.target.value)}>{accounts.map((a)=><option key={a.id} value={a.id}>{a.email}</option>)}</select></label>
            {/password|sign-in|reconnect/i.test(syncFailed||"")&&<button className="link" type="button" onClick={()=>navigate("Mailboxes")}>Reconnect</button>}
          </div>
          <button type="button" className="find-btn" aria-label="Search mail, clients and bookings" onClick={()=>setPalette(true)}>
            <MailIcon name="search" size="sm"/>
            <span>Find a client, booking or email</span>
            <kbd>/</kbd>
          </button>
          {search&&<p className="search-note"><span>Results for &ldquo;{search}&rdquo;</span><button type="button" className="link" onClick={()=>setSearch("")}>Clear search</button></p>}
          {view==="Spam"&&<div className="folder-banner warn"><MailIcon name="spam" size="sm"/><div><b>Do not open links or attachments here.</b><span>If something real lands here, mark it Not spam to move it to the inbox.</span></div></div>}
          {view==="Bin"&&<div className="folder-banner calm"><MailIcon name="clock" size="sm"/><div><b>Deleted mail can be restored here.</b><span>Use Restore to move a conversation back to your inbox.</span></div></div>}
          {(filters.length>0||selectedKeys.length>0)&&<div className="filters">{selectedKeys.length?<div className="bulk" role="toolbar" aria-label="Selected conversations"><b>{selectedKeys.length} selected</b>{selectedKeys.length<conversations.length&&<button type="button" className="link" onClick={()=>setSelectedKeys(conversations.map(rowKey))}>Select all {conversations.length}</button>}<span className="bulk-actions"><button type="button" className="btn ghost" disabled={busy} onClick={()=>void bulk("archive")}>Archive</button><button type="button" className="btn ghost" disabled={busy} onClick={()=>void bulk("read")}>Mark read</button><button type="button" className="btn ghost icon" aria-label="Clear selection" onClick={()=>setSelectedKeys([])}><MailIcon name="x" size="xs"/></button></span></div>:<>{conversations.length>1&&<button type="button" className="sel-all" aria-label={`Select all ${conversations.length} conversations`} title="Select all. Shift-click a monogram to select a range." onClick={()=>setSelectedKeys(conversations.map(rowKey))}><MailIcon name="check" size="xs"/></button>}<div className="seg" role="group" aria-label="Filter">{filters.map((f)=><button type="button" key={f} aria-pressed={filter===f} onClick={()=>{setFilter(f);setSelectedKeys([]);}}>{f[0].toUpperCase()+f.slice(1)}</button>)}</div></>}</div>}
        </div>
        {!folder&&view!=="Assigned"?<div className="empty-state">{syncError || (checking ? "Loading folders" : `This mailbox has no ${view} folder.`)}</div>:<MailList items={visibleItems} selected={selected?rowKey(selected):null} sentFolder={special==="sent"} inbox={inbox} waitingKeys={waitingKeys} loading={loading} error={list.error} hasMore={view!=="Assigned"&&view!=="Snoozed"&&list.items.length<list.total} empty={emptyList} onOpen={open} onMore={()=>void more()} onRetry={()=>setTick((n)=>n+1)} selectedKeys={selectedKeys} onSelect={select} onAct={(r,action)=>void actRow(r,action)} rowContext={rowContext} folderAction={folderAction} party={rowParty} returned={returned} now={clock} marks={(r)=>({draft:draftKeys.has(conversation(r)),snoozedUntil:filter==="snoozed"||view==="Snoozed"?snoozedUntil(r):null})} assignment={(r)=>{const email=metaOf(r)?.assigned_email;return workspace?.people.find((p)=>p.email===email)?.name??email??"";}}/>}
      </section>
      <section className="panel main" aria-label={selected?"Conversation":"Morning brief"}>{!selected&&!inbox&&!briefOpen&&IDLE[view]?<div className="reader-idle"><span className="idle-icon"><MailIcon name={icon(view)}/></span><h2>{IDLE[view]![0]}</h2><p>{IDLE[view]![1]}</p><button type="button" className="btn line sm" onClick={()=>navigate("Today")}><MailIcon name="sun" size="sm"/>Open Today</button></div>:!selected?<><button type="button" className="btn ghost back-btn" onClick={()=>setBriefOpen(false)}>Back to list</button><MorningBrief workspace={workspace} waiting={waiting} followUps={followUps} unread={totalUnread} mailboxCount={accounts.length} me={me} onOpen={open} onGo={(target,f)=>navigate(target as View,f??"all")}/></>:<Motion key={picked!.accountId+":"+rowKey(selected)} enter={{"mail-open":"mail-open","mail-step":"mail-step",default:"none"}} exit={{"mail-open":"mail-open-out","mail-step":"mail-step-out","mail-close":"mail-close-out",default:"none"}} update={{"mail-loaded":"mail-loaded",default:"none"}} default="none"><MailReader accountId={picked!.accountId} mailboxEmail={accountEmail(picked!.accountId)} special={boxes.find((b)=>b.path===selected.mailbox)?.special??special} messages={thread.messages} loading={thread.loading} error={thread.error} flagged={selected.flagged} onAct={(action)=>void actRow(selected,action)} onReply={reply} replyPrimary={!draft&&!heroShown} onBack={()=>withDraftClosed(closeReader)} onRetry={()=>open(selected)} onDone={()=>void markDone()} done={done} waiting={waits(selected)} onInspector={()=>setInspector((v)=>!v)} inspector={inspector} bookedSeconds={match.booking?.request.lengthSeconds}
        client={match.client?{id:match.client.id,business:match.client.advertiser.business}:null} onClient={(id)=>{navigate("Clients");setClientId(id);}}
        people={workspace?.people} assignedEmail={selectedMeta?.assigned_email} me={workspace?.me} onAssign={workspace?(email)=>void assignConversation(selected,email):undefined}
        snoozedUntil={snoozedUntil(selected)} onSnooze={workspace&&picked?.accountId===accountId?(until)=>void snooze(selected,until):undefined}
        remindAt={selectedMeta?.remind_at&&Date.parse(selectedMeta.remind_at)>clock?selectedMeta.remind_at:null} noReply={noReply} onRemind={workspace&&picked?.accountId===accountId&&rowParty(selected)?(days)=>void remind(selected,days):undefined}
        chips={<div className="chips">{match.client&&!heroShown&&<button type="button" className="chip" onClick={()=>{navigate("Clients");setClientId(match.client!.id);}}><MailIcon name="clients" size="xs"/><span className="chip-text">{match.client.advertiser.business}</span></button>}{match.booking&&!heroShown&&<a className="chip" href={bookingHref(match.booking)} aria-label={`Open booking ${match.booking.reference}`}><MailIcon name="calendar" size="xs"/><span className="chip-text">{selected.subject.toUpperCase().includes(match.booking.reference.toUpperCase()) ? "Open booking" : match.booking.reference}</span></a>}{selectedMeta?.assigned_email&&<span className="chip"><MailIcon name="assigned" size="xs"/>{workspace?.people.find((p)=>p.email===selectedMeta.assigned_email)?.name??selectedMeta.assigned_email}</span>}</div>}
        hero={match.booking&&workspace?.directory?<BookingHero booking={match.booking} client={match.client} data={workspace.directory} today={workspace.today} onClient={(id)=>{navigate("Clients");setClientId(id);}}/>:null}>
        {draft&&draft.title!=="New email"?composeView:latest&&<div className="dock-wrap"><div className="dock"><button type="button" className="dock-closed" onClick={()=>reply("reply",latest)}><MailIcon name={resumable?"drafts":"reply"} size="sm"/><span>{resumable?"Continue your reply":"Reply"} to {senderName(latest.from[0]??{name:"",address:""})}...</span><small>from {account?.email}</small><kbd>R</kbd></button>{!!workspace?.templates.length&&<div className="dock-pills">{workspace.templates.slice(0,4).map((t)=><button key={t.id} type="button" className="pillb" onClick={()=>reply("reply",latest,t.body)}>{t.name}</button>)}</div>}</div></div>}
      </MailReader></Motion>}</section>
      {showInspector&&<Inspector booking={false} match={match} workspace={workspace} accountId={picked!.accountId} subject={selected.subject} party={rowParty(selected)} onClose={()=>setInspector(false)} onClient={(id)=>{navigate("Clients");setClientId(id);}} onReplyText={replyText} onUpdated={()=>setTick((n)=>n+1)} onNote={saveNote}/>}
      </>}
    </div></Motion>
    {draft&&(draft.title==="New email"||!selected)&&<MailModal ref={composeModal} exitFirst={false} label="Write an email" className="compose-modal" onClose={()=>compose.current?.close()}>{composeView}</MailModal>}
    {palette&&<SearchPalette onConversation={open} onSearchMail={(text)=>withDraftClosed(()=>{openSequence.current++;setPicked(null);setBriefOpen(false);setSelectedKeys([]);if(!["Inbox","Sent","Archive","Starred","Spam","Bin"].includes(view))setView("Inbox");setSearch(text.slice(0,200));})} items={paletteItems} errors={[...(waiting?.ok?waiting.data.errors:waiting?[waiting.error]:[]),...(list.error?[list.error]:[])]} onClose={()=>setPalette(false)}/>}{help&&<ShortcutsSheet onClose={()=>setHelp(false)}/>}{confirmDialog}
    {toast&&<div className="toast" role="status" key={toast.id}><span>{toast.text}</span>{toast.accessible&&<span className="sr">{toast.accessible}</span>}{toast.undo&&<button type="button" onClick={()=>void undo()}>Undo <kbd>Z</kbd></button>}<i className="bar" style={{animation:`mail-drain ${UNDO_MS}ms linear forwards`}}/></div>}{demo&&<span className="sample-label">Sample data. No email is delivered.</span>}
  </section>;
}
