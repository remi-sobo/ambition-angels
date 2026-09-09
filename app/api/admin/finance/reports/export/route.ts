import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { checkExportGate } from "@/lib/admin/metrics/exportGate";
import {
  ARTIFACT_TYPE,
  renderReportHtml,
  type ReportMetricLine,
} from "@/lib/finance/reportExport";
import { DOCUMENTS_BUCKET } from "@/lib/documents/config";
import { audit } from "@/lib/audit";

// POST /api/admin/finance/reports/export — the Contract 7 EXIT for a
// composed financial report (Spec Finance N3).
//
// The gate runs here, not in the UI: checkExportGate over the metric keys
// the artifact references, with this draft's waivers subtracted. Blocked →
// 409 and NOTHING is written. Passed → the artifact renders as a
// self-contained HTML file (waivers printed INTO it — they travel with the
// artifact), lands in storage, and becomes a documents row whose id IS the
// draft's rid — so every export_waivers row written while drafting points at
// the shipped document (decision 2, signed). This route never writes a
// waiver and never re-implements reports.approve; the documents insert rides
// the SESSION client so documents-write RLS is the authority there.

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    rid?: unknown; title?: unknown; keys?: unknown;
  } | null;
  const rid = body?.rid;
  if (!isUuid(rid)) return NextResponse.json({ error: "rid must be a uuid" }, { status: 400 });
  const title =
    (typeof body?.title === "string" && body.title.trim().slice(0, 120)) || "Financial report";
  const rawKeys = Array.isArray(body?.keys)
    ? (body.keys as unknown[]).filter((k): k is string => typeof k === "string")
    : [];

  const catalog = await getMetricCatalog();
  const byKey = new Map(catalog.map((m) => [m.metric_key, m]));
  const keys = Array.from(new Set(rawKeys)).filter((k) => byKey.has(k)).slice(0, 20);
  if (keys.length === 0) {
    return NextResponse.json({ error: "No valid metric keys selected" }, { status: 400 });
  }

  // ── The gate (Contract 7). Blocked → nothing ships, nothing is written. ──
  const gate = await checkExportGate(ARTIFACT_TYPE, rid, keys);
  if (gate.blocked) {
    return NextResponse.json(
      {
        error: `Export blocked: ${gate.blockers.map((b) => `${b.metricKey} (${b.reason})`).join(", ")}. Resolve them, or waive with reports.approve.`,
        blocked: true,
        blockers: gate.blockers,
      },
      { status: 409 },
    );
  }

  // ── Render the artifact — dates on every value, waivers printed in. ──────
  const supabase = createServerSupabase();
  const { data: narrativeRow } = await supabase
    .from("reed_drafts")
    .select("body")
    .eq("org_id", ctx.orgId)
    .eq("kind", "report_narrative")
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metrics: ReportMetricLine[] = keys.map((key) => {
    const m = byKey.get(key)!;
    const flag =
      m.confirmed_state === "conflict" || m.confirmed_state === "stale"
        ? m.confirmed_state // present only when waived — the gate passed
        : m.confirmed_state === "unconfirmed"
          ? "unconfirmed"
          : m.stale
            ? "past cadence"
            : null;
    return {
      key,
      name: m.name,
      value: m.latest?.value ?? null,
      capturedOn: m.latest?.captured_on ?? null,
      unit: m.unit,
      flag,
    };
  });

  const generatedOn = new Date().toISOString().slice(0, 10);
  const html = renderReportHtml({
    title,
    orgName: ctx.orgName,
    generatedOn,
    metrics,
    narrative: (narrativeRow?.body as string | null) ?? null,
    waivers: gate.waivers.map((w) => ({
      metricKey: w.metric_key,
      reason: w.reason,
      waivedAt: w.waived_at,
    })),
  });

  const slug =
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "financial-report";
  const filename = `${slug}-${generatedOn}.html`;
  const path = `${ctx.orgId}/${rid}/${filename}`;
  const buf = Buffer.from(html, "utf8");

  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: "text/html", upsert: false });
  if (upErr) {
    // upsert:false makes a re-export of the same rid fail loudly instead of
    // silently replacing a shipped artifact.
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data: doc, error: insErr } = await supabase
    .from("documents")
    .insert({
      id: rid, // the draft's artifact id — waivers already point here
      org_id: ctx.orgId, // from session — the table has no default, on purpose
      storage_path: path,
      filename,
      mime: "text/html",
      size_bytes: buf.byteLength,
      title,
      doc_type: ARTIFACT_TYPE,
      uploaded_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insErr || !doc) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]); // no orphaned object
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  await audit(req, {
    action: "finance.report.export",
    entityType: "documents",
    entityId: rid,
    after: {
      title,
      metric_keys: keys,
      waived: gate.waived.map((w) => w.metricKey),
      unconfirmed: gate.unconfirmed,
    },
  });

  return NextResponse.json({ ok: true, id: rid });
}
