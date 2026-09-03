import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ingestTask } from "@/lib/admin/ops/ingest";
import { getResidentOrgId } from "@/lib/admin/orgs";

/**
 * BloomOS MCP connector (remote, Streamable HTTP, stateless).
 *
 * Exposes a "create_task" tool so an MCP client — e.g. Shannon's Claude Cowork
 * morning run — can drop tasks straight onto the BloomOS ops board. Because
 * Claude's connector UI can't attach a bearer token, the secret lives in the
 * URL path instead (a capability URL): /api/mcp/<TASK_INGEST_SECRET>. Anyone
 * with the URL can call it, so treat it like a password — it's rotatable via
 * the env var. Stateless JSON-RPC: each POST gets a single JSON response; no
 * SSE / session needed.
 */
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "BloomOS", version: "1.0.0" };

const TOOLS = [
  {
    name: "create_task",
    description:
      "Create a to-do in BloomOS (Ambition Angels' operating system). It lands on the ops board task list, assigned to Shannon by default. Use this to push tasks from the morning report. Pass a stable dedupe_key (e.g. the source email's thread or message id) so re-running the report doesn't create duplicates.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, specific task title." },
        description: { type: "string", description: "Optional context — who to nudge and why, links, etc." },
        due_date: { type: "string", description: "Optional due date, YYYY-MM-DD." },
        priority: { type: "string", enum: ["urgent", "high", "medium", "low"], description: "Default medium." },
        category: {
          type: "string",
          enum: ["operations", "fundraising", "program", "product", "finance", "compliance", "board", "other"],
          description: "Default operations.",
        },
        assignee: { type: "string", description: "First-name handle of an org member (e.g. shannon). Default shannon." },
        pin_today: { type: "boolean", description: "Also pin to the ops board's Today section. Default false." },
        dedupe_key: {
          type: "string",
          description: "Stable id (e.g. email thread/message id) so the same task isn't created twice on re-run.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "list_my_tasks",
    description:
      "List the open (not done) BloomOS tasks for a person, so you can see what's already on the board before adding more. Defaults to Shannon.",
    inputSchema: {
      type: "object",
      properties: { assignee: { type: "string", description: "First-name handle of an org member. Default shannon." } },
    },
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg: Rpc, req: NextRequest, supabase: SupabaseClient): Promise<object | null> {
  // Notifications (no id, e.g. notifications/initialized) get no response.
  if (msg.id === undefined || msg.id === null) return null;
  const { id, method } = msg;
  const params = msg.params ?? {};

  if (method === "initialize") {
    const requested = params.protocolVersion;
    return ok(id, {
      protocolVersion: typeof requested === "string" ? requested : PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params.name;
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    if (name === "create_task") {
      const r = await ingestTask(supabase, req, args, "mcp");
      const text =
        r.status === "created"
          ? `Created task "${r.title}" in BloomOS.`
          : r.status === "skipped"
          ? `Task "${r.title}" already exists — skipped (dedupe).`
          : `Couldn't create "${r.title}": ${r.error}`;
      return ok(id, { content: [{ type: "text", text }], isError: r.status === "error" });
    }
    if (name === "list_my_tasks") {
      const assignee =
        typeof args.assignee === "string" && args.assignee.trim() ? args.assignee.trim().toLowerCase() : "shannon";
      // Org fence. This is a service-role read on an external surface, and the
      // secret is a deployment fact for ONE org (the same resident-org
      // resolution ingestTask uses on the write side). Without it, a handle
      // shared across tenants ("remi" exists in more than one org) returned
      // every tenant's tasks to the caller.
      const orgId = await getResidentOrgId();
      const { data } = await supabase
        .from("ops_tasks")
        .select("title, due_date, priority")
        .eq("org_id", orgId)
        .eq("assigned_to", assignee)
        .neq("status", "done")
        .is("archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50);
      const rows = (data ?? []) as { title: string; due_date: string | null; priority: string }[];
      const text = rows.length
        ? `${assignee}'s open tasks:\n${rows.map((t) => `• ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""} [${t.priority}]`).join("\n")}`
        : `${assignee} has no open tasks.`;
      return ok(id, { content: [{ type: "text", text }] });
    }
    return err(id, -32602, `Unknown tool: ${String(name)}`);
  }
  return err(id, -32601, `Method not found: ${String(method)}`);
}

export async function POST(req: NextRequest, { params }: { params: { secret: string } }) {
  const secret = process.env.TASK_INGEST_SECRET;
  if (!secret || params.secret !== secret) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Rpc | Rpc[] | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json(err(null, -32700, "Parse error"));
  }

  const supabase = getSupabaseAdmin();
  if (Array.isArray(body)) {
    const out: object[] = [];
    for (const m of body) {
      const r = await handle(m, req, supabase);
      if (r) out.push(r);
    }
    if (out.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(out);
  }

  const r = await handle(body, req, supabase);
  if (!r) return new NextResponse(null, { status: 202 });
  return NextResponse.json(r);
}

// Clients may probe with GET for an SSE stream; we're stateless, so decline.
export async function GET(_req: NextRequest, { params }: { params: { secret: string } }) {
  const secret = process.env.TASK_INGEST_SECRET;
  if (!secret || params.secret !== secret) return new NextResponse("Not found", { status: 404 });
  return new NextResponse("Method Not Allowed", { status: 405 });
}
