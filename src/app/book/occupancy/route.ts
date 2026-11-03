import { getStore } from "@/lib/store";
import { StoreError } from "@/lib/store/validation";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    return Response.json(await getStore().occupancy(params.get("from") ?? "", params.get("to") ?? ""), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof StoreError ? error.message : "Unable to load busy hours. Please try again." },
      { status: error instanceof StoreError ? 400 : 503 });
  }
}
