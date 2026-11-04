import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
export const workspaceFonts = geist.variable + " " + mono.variable;
export const themeScript = "(function(){var t;try{t=localStorage.getItem('kca-theme')}catch(e){}if(t!=='dark'&&t!=='light'){var m=document.cookie.match(/(?:^|; )kca-theme=(dark|light)(?:;|$)/);t=m?m[1]:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t})()";
export default function Workspace({ children }: { children: ReactNode }) {
  return <div className={"nightshift " + geist.variable + " " + mono.variable}>{children}</div>;
}
