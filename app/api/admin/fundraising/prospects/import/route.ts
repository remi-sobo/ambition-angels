/**
 * POST /api/admin/fundraising/prospects/import — bulk-add HubSpot mirror contacts
 * to the bench (fr_prospects, source 'hubspot'). Body: { hubspot_ids: string[] }.
 * Skips ids already on the bench. Type is inferred from email/company/name.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PERSONAL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "me.com", "aol.com", "live.com", "msn.com", "proton.me", "protonmail.com",
]);
const FOUNDATION = ["foundation", "fund", "trust", "philanthrop", "endowment", "charitable"];

function inferType(email: string | null, company: string | null, name: string): string {
  const dom = email && email.includes("@") ? email.split("@")[1].toLowerCase() : "";
  const c = (company ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (FOUNDATION.some((k) => c.includes(k) || n.includes(k)) || dom.endsWith(".org")) return "foundation";
  if (dom && PERSONAL.has(dom)) return "individual";
  if (c && dom) return "corporate";
  return "individual";
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { hubspot_ids?: unknown } | null;
  const ids = Array.isArray(body?.hubspot_ids)
    ? Array.from(new Set(body!.hubspot_ids.filter((v): v is string => typeof v === "string" && v.length > 0))).slice(0, 500)
    : [];
  if (!ids.length) return NextResponse.json({ error: "hubspot_ids is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const [{ data: contacts }, { data: existing }] = await Promise.all([
    supabase.from("hs_contacts").select("hubspot_id, first_name, last_name, email, company").in("hubspot_id", ids),
    supabase.from("fr_prospects").select("hubspot_contact_id").in("hubspot_contact_id", ids),
  ]);

  const onBench = new Set((existing ?? []).map((r) => r.hubspot_contact_id as string));
  const user = await getAdminUser();

  const toInsert = (contacts ?? [])
    .filter((c) => !onBench.has(c.hubspot_id as string))
    .map((c) => {
      const name =
        [c.first_name, c.last_name].filter((s): s is string => typeof s === "string" && s.length > 0).join(" ").trim() ||
        (c.email as string | null) ||
        "Unknown contact";
      const email = (c.email as string | null) ?? null;
      const company = (c.company as string | null) ?? null;
      return {
        org_id: ctx.orgId,
        hubspot_contact_id: c.hubspot_id as string,
        source: "hubspot",
        status: "active",
        type: inferType(email, company, name),
        name: name.slice(0, 200),
        email,
        org_name: company,
        created_by: user,
      };
    });

  if (!toInsert.length) {
    return NextResponse.json({ ok: true, added: 0, skipped: ids.length });
  }

  const { data: inserted, error } = await supabase.from("fr_prospects").insert(toInsert).select("id");
  if (error) {
    console.error("[prospects/import] insert failed:", error.message);
    return NextResponse.json({ error: "Could not import — try again." }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.prospects.import",
    entityType: "fr_prospects",
    entityId: null,
    after: { added: inserted?.length ?? 0, source: "hubspot" },
  });

  return NextResponse.json({ ok: true, added: inserted?.length ?? 0, skipped: ids.length - (inserted?.length ?? 0) });
}
