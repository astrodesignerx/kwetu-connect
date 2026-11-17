export default function ManagerScreenSkeleton({ settings = false }: { settings?: boolean }) {
  return <section className={(settings ? "mg-settings" : "mg-schedule") + " mg-screen-loading"} role="status" aria-label={settings ? "Loading screen settings" : "Loading screen schedule"}>
    <div className="mg-intro" aria-hidden="true"><h1 className="mg-heading">{settings ? "Screen settings" : "Screen schedule"}</h1><div className="mg-loading-controls" /></div>
    {settings ? <div className="settings-c" aria-hidden="true"><div className="settings-tiles">{["price", "discounts", "capacity", "lengths", "often", "lead", "blocks", "hours"].map((section) => <div className={"settings-tile" + (section === "hours" ? " is-wide" : "")} data-section={section} key={section}><div className="mg-loading-line" /><div className="mg-loading-line" /></div>)}</div><aside className="settings-panel"><div className="mg-loading-line" /><div className="mg-loading-surface" /><div className="mg-loading-surface" /></aside></div> : <div aria-hidden="true"><div className="v2-schedule-top"><div className="v2-card mg-loading-surface" /><div className="v2-card mg-loading-surface" /></div><div className="v2-card mg-loading-week" /></div>}
  </section>;
}

