import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { StoreError } from "@/lib/store/validation";
export async function GET(request: NextRequest) {
  await requireStaff();
  const params = request.nextUrl.searchParams;
  const file = params.get("file");
  if (file !== "playlists.csv" && file !== "schedule.csv") return new Response("Choose a CSV file.", { status: 400 });
  try {
    const schedule = await getStore().schedule(params.get("from") ?? "", params.get("to") ?? "");
    return new Response(file === "playlists.csv" ? schedule.playlistsCsv : schedule.scheduleCsv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    return new Response(error.message, { status: 400 });
  }
}
