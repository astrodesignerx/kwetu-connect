"use client";
import { useEffect, useState } from "react";
import { CHECK_ORDER, checkFile, measure, runCheck, type CheckResult } from "@/lib/advert-checks";

export default function AdvertAttachment({ href, filename, type, size, seconds }: { href:string; filename:string; type:string; size:number; seconds?:number }) {
  const [results,setResults] = useState<CheckResult[]>([]), [message,setMessage] = useState("Checking advert file");
  const media = /^(video|image)\//i.test(type);
  useEffect(() => {
    if(!media) return;
    let live=true, url="";
    const controller=new AbortController();
    void (async () => {
      const first={id:"file" as const,label:"File type and size",...checkFile({type,size})};
      if(first.state === "fail") { if(live) {setResults([first]);setMessage("Advert file needs changes");} return; }
      try {
        const response=await fetch(href,{signal:controller.signal});
        if(!response.ok) throw new Error("download");
        const blob=await response.blob();
        const file=new File([blob],filename,{type});
        url=URL.createObjectURL(file);
        const measured=await measure(file,url);
        if(!live) return;
        const checks=CHECK_ORDER.filter((id) => id!=="length" || seconds!==undefined).map((id) => runCheck(id,file,measured,seconds ?? 0));
        if(measured?.kind === "video" && measured.duration === null && seconds!==undefined) {
          const length=checks.find((c) => c.id === "length");
          if(length) {length.state="fail";length.detail="Video duration could not be read. Check it manually.";}
        }
        setResults(checks);
        setMessage(checks.some((c) => c.state==="fail") ? "Advert file needs changes" : checks.some((c) => c.state==="warn") ? "Advert file needs a staff check" : "Fits the screen");
      } catch {if(live) setMessage("The file could not be checked. Download it and check manually.");}
      finally {if(url) URL.revokeObjectURL(url);}
    })();
    return () => {live=false;controller.abort();};
  },[href,filename,type,size,seconds,media]);
  if(!media) return null;
  return <details className="mail-advert-check" aria-live="polite"><summary>{message}</summary>{results.map((r) => <p key={r.id} data-check={r.state}>{r.label}: {r.detail}</p>)}{seconds===undefined && <p>Length not checked: no matched booking.</p>}</details>;
}
