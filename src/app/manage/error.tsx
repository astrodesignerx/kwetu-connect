"use client";
export default function ManagerError({ reset }: { reset: () => void }) {
  return <div className="space-y-4"><h1 className="text-xl font-bold">Unable to load the manager area</h1><p>Please try again. If this continues, check the storage setup.</p><button className="staff-button" onClick={reset}>Try again</button></div>;
}
