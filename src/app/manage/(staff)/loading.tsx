import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() { return <div className="workspace-loading" role="status" aria-label="Loading manager"><Skeleton className="loading-photo" /><Skeleton /><Skeleton className="loading-grid" /></div>; }
