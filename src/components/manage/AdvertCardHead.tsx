import Link from "next/link";
import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import { initials } from "@/lib/advert-desk";

// Header of the preview card, shared by the review view and the no-file view.
export default function AdvertCardHead({ business, facts, reference, downloadUrl, fileName }: { business: string; facts: string; reference: string; downloadUrl: string | null; fileName: string }) {
  return <header className="advert-card-head">
    <span className="advert-initials" aria-hidden="true">{initials(business)}</span>
    <div className="advert-card-title"><h2>{business}</h2><p>{facts}</p></div>
    <div className="advert-card-tools">
      {downloadUrl && <a className="advert-download" href={downloadUrl} download={fileName}><DownloadSimple size={14} aria-hidden="true" />Download</a>}
      <Link className="advert-open" href={"/manage/bookings?selected=" + reference}>Open booking</Link>
    </div>
  </header>;
}
