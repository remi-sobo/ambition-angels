import { NextResponse } from "next/server";
import { getBoardContext } from "@/lib/board/auth";
import { getAgenda } from "@/lib/board/data";

/** The live agenda, re-fetched when realtime fires or the poll ticks. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ items: await getAgenda(params.id) }, {
    headers: { "cache-control": "no-store" },
  });
}
