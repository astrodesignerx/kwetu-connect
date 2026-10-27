import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ reference: string; id: string }> }) {
  await requireStaff();
  const { reference, id } = await params;
  const url = await getStore().advertUrl(reference, id);
  return url ? NextResponse.redirect(url) : new Response("Demo mode keeps file names only.", { status: 404 });
}
