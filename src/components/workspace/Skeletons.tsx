import type { CSSProperties, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** A grey text-height bar; `w` is its width, like "40%" or "120px". */
function Line({ w = "60%", h }: { w?: string; h?: string }) {
  const style: CSSProperties = { width: w, ...(h ? { height: h } : {}) };
  return <Skeleton className="sk-line" style={style} />;
}

function Panel({ h }: { h: string }) {
  return <Skeleton className="sk-panel" style={{ height: h }} />;
}

/** Same grid as the real Timetable: a header row, five time rows, seven day columns. */
function GridSkeleton() {
  return <div className="timetable sk-timetable" aria-hidden="true">
    <span />
    {Array.from({ length: 7 }, (_, i) => <Line key={"d" + i} w="40%" />)}
    {Array.from({ length: 5 }, (_, row) => [
      <div key={"l" + row} className="sk-stack"><Line w="70%" /><Line w="45%" /></div>,
      ...Array.from({ length: 7 }, (_, col) => <Skeleton key={row + "-" + col} className="sk-cell" />),
    ])}
  </div>;
}

export function BookSkeleton() {
  return <div role="status" aria-label="Loading booking">
    <div className="book-header sk-header" aria-hidden="true">
      <Skeleton className="sk-logo" />
      <div className="sk-row"><Line w="72px" h="28px" /><Line w="90px" /><Line w="120px" /></div>
      <div className="sk-row sk-push"><Line w="110px" /><Line w="120px" h="32px" /><Line w="90px" /></div>
    </div>
    <section className="booking-canvas" aria-hidden="true"><div className="booking-workspace"><div className="booking-layout">
      <Skeleton className="screen-preview sk-block" />
      <div className="booking-controls">
        {[5, 6].map((n) => <div key={n} className="ns-card"><div className="sk-fill">
          <div className="sk-split"><Line w="30%" /><Line w="20%" /></div>
          <div className="sk-buttons">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="sk-button" />)}</div>
        </div></div>)}
        <div className="ns-card"><div className="sk-fill sk-stack"><Line w="18%" /><Line w="55%" /><Line w="28%" /></div></div>
      </div>
      <div className="booking-grid-panel timetable-panel">
        <div className="timetable-heading"><div className="sk-stack sk-fill"><Line w="160px" h="16px" /><Line w="260px" /></div><Line w="140px" /></div>
        <GridSkeleton />
      </div>
      <aside className="quote-desktop"><div className="quote-card sk-stack sk-quote">
        <Line w="30%" /><Line w="70%" h="56px" /><Line w="55%" />
        <Panel h="110px" /><Panel h="96px" />
        <div className="sk-buttons">{[0, 1, 2, 3].map((i) => <Panel key={i} h="64px" />)}</div>
        <div className="sk-grow" />
        <Panel h="40px" />
        <div className="sk-buttons"><Panel h="40px" /><Panel h="40px" /></div>
      </div></aside>
    </div></div></section>
    <span className="sr-only">Loading booking</span>
  </div>;
}

function Tile({ className, lines = 3, children }: { className: string; lines?: number; children?: ReactNode }) {
  return <div className={"ns-card sk-card-col " + className}>
    <Line w="40%" />
    {children ?? Array.from({ length: lines }, (_, i) => <Line key={i} w={["80%", "55%", "65%", "45%"][i % 4]} />)}
  </div>;
}

export function OverviewSkeleton() {
  return <section role="status" aria-label="Loading overview">
    <div className="week-navigation" aria-hidden="true"><Line w="200px" /><div className="sk-row"><Line w="110px" h="32px" /><Line w="90px" h="32px" /><Line w="100px" h="32px" /></div></div>
    <div className="overview-bento" aria-hidden="true">
      <Skeleton className="screen-preview screen-now sk-block" />
      <Tile className="revenue-tile"><Line w="65%" h="36px" /><Line w="50%" /><Skeleton className="sk-panel sk-grow" /></Tile>
      <Tile className="needs-you">{[0, 1, 2].map((i) => <Panel key={i} h="54px" />)}</Tile>
      <div className="ns-card week-grid-panel"><div className="timetable-heading"><Line w="160px" /><Line w="140px" /></div><GridSkeleton /></div>
      <div className="ns-card week-ring-tile"><Skeleton className="sk-ring" /><Line w="60%" /></div>
      <Tile className="hour-tile"><div className="sk-bars">{Array.from({ length: 16 }, (_, i) => <Skeleton key={i} className="sk-bar" style={{ height: 20 + ((i * 37) % 60) + "%" }} />)}</div></Tile>
      <Tile className="live-tile" lines={4} />
      <Tile className="collect-tile"><Line w="65%" h="36px" /><Line w="50%" /></Tile>
    </div>
    <span className="sr-only">Loading overview</span>
  </section>;
}

export function BookingsSkeleton() {
  return <section className="bookings-split" role="status" aria-label="Loading bookings">
    <div className="booking-list-pane sk-stack" aria-hidden="true">
      <Line w="140px" h="24px" /><Line w="220px" />
      <div className="sk-row">{[0, 1, 2, 3, 4].map((i) => <Line key={i} w="80px" h="30px" />)}</div>
      <div className="booking-list">{Array.from({ length: 6 }, (_, i) => <div key={i} className="booking-list-row sk-list-row">
        <Skeleton className="business-avatar" />
        <div className="booking-list-business sk-stack"><Line w="50%" /><Line w="35%" /><Line w="45%" /></div>
        <Line w="64px" h="22px" />
        <div className="sk-stack sk-end"><Line w="90px" /><Line w="60px" /></div>
      </div>)}</div>
    </div>
    <div className="booking-detail-panel sk-stack" aria-hidden="true"><Line w="40%" /><Line w="70%" h="28px" /><Panel h="180px" /><Line w="60%" /><Line w="50%" /><Panel h="120px" /></div>
    <span className="sr-only">Loading bookings</span>
  </section>;
}

export function StaffPageSkeleton({ label, cards = 2 }: { label: string; cards?: number }) {
  return <section className="space-y-6" role="status" aria-label={"Loading " + label}>
    <div aria-hidden="true" className="space-y-6">
      <Line w="220px" h="28px" />
      {Array.from({ length: cards }, (_, i) => <div key={i} className="ns-card sk-card-col"><Line w="30%" />{Array.from({ length: 5 }, (_, j) => <Panel key={j} h="36px" />)}</div>)}
    </div>
    <span className="sr-only">Loading {label}</span>
  </section>;
}
