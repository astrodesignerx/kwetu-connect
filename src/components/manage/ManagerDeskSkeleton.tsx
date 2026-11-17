/** Mirrors each desk while its existing data calls resolve. */
export default function ManagerDeskSkeleton({ adverts = false }: { adverts?: boolean }) {
  return <section className={(adverts ? "mg-adverts" : "mg-bookings") + " mg-phase2-loading"} role="status" aria-label={adverts ? "Loading advert desk" : "Loading bookings"}>
    <div className="pipeline-heading" aria-hidden="true"><h1 className="mg-heading">{adverts ? "Advert desk" : "Bookings pipeline"}</h1><div className="mg-loading-controls" /></div>
    {adverts ? <div className="advert-grid" aria-hidden="true">
      <section className="v2-card advert-card advert-preview-card"><div className="mg-loading-toolbar" /><div className="advert-stage-slot" /><div className="mg-ad-specs">{[0, 1, 2, 3].map((i) => <div className="mg-loading-tile" key={i} />)}</div></section>
      <section className="v2-card advert-card advert-checks-card"><h2>Checks</h2><div className="advert-checks">{[0, 1, 2, 3, 4, 5].map((i) => <div className="mg-loading-tile" key={i} />)}</div><div className="mg-loading-block" /></section>
      <section className="v2-card advert-card advert-queue"><div className="mg-loading-toolbar" /><div className="mg-loading-tile" /></section>
    </div> : <div aria-hidden="true"><div className="mg-loading-toolbar" /><div className="v2-bookings-summary"><div className="v2-card" /><div className="v2-card" /></div><div className="pipeline-scroll"><div className="pipeline-board">{[0, 1, 2, 3, 4].map((i) => <div className="pipeline-column" key={i}><div className="mg-loading-toolbar" /><div className="mg-loading-block" /></div>)}</div></div></div>}
  </section>;
}
