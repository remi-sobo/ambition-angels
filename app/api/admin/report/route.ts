import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { sendOperatorEmail, operatorEmailShell } from "@/lib/email/operator";
import { adminUrl } from "@/lib/origins";

/**
 * In-app issue reporter (the FAB "Report" action). Shannon or Remi snap a photo
 * and/or describe something weird, and it becomes a triaged item we tackle later:
 *  - the photo (optional) is stored in the private `bloomos-reports` bucket,
 *  - a task lands in the "BloomOS Upgrades" project (auto-created), assigned to
 *    Remi, tagged `report` + the type,
 *  - both operators get an email with the description and an inline photo.
 *
 * multipart/form-data: description (required), type (bug|confusing|idea), photo?.
 */
export const dynamic = "force-dynamic";

const UPGRADES_PROJECT = "BloomOS Upgrades";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year — internal, low-volume.

type ReportType = "bug" | "confusing" | "idea";
const TYPE_META: Record<ReportType, { label: string; emoji: string }> = {
  bug: { label: "Bug", emoji: "🐞" },
  confusing: { label: "Confusing", emoji: "🤔" },
  idea: { label: "Idea", emoji: "💡" },
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reporter = await getAdminUser();
  if (!reporter) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const description = String(form.get("description") ?? "").trim();
  const rawType = String(form.get("type") ?? "bug");
  const type: ReportType = rawType === "confusing" || rawType === "idea" ? rawType : "bug";
  const photo = form.get("photo");

  // From the guided bug flow: a synthesized Claude Code debugging prompt, the
  // Q&A transcript it came from, and a short title. All optional — a plain
  // idea/confusing report (or a bug sent without finishing the interview) just
  // omits them and behaves exactly as before.
  const debugPrompt = String(form.get("debugPrompt") ?? "").trim();
  const reportTitle = String(form.get("title") ?? "").trim();
  let transcript: { role: "user" | "assistant"; content: string }[] = [];
  const rawTranscript = String(form.get("transcript") ?? "");
  if (rawTranscript) {
    try {
      const parsed = JSON.parse(rawTranscript);
      if (Array.isArray(parsed)) {
        transcript = parsed
          .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
          .map((t) => ({ role: t.role, content: String(t.content) }));
      }
    } catch {
      /* ignore a malformed transcript — the prompt still stands on its own */
    }
  }

  if (!description && !debugPrompt && !(photo instanceof File && photo.size > 0)) {
    return NextResponse.json({ error: "Add a description or a photo." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const meta = TYPE_META[type];

  // 1. Upload the photo (if any) to the private bucket.
  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const ext = EXT_BY_MIME[photo.type] ?? "bin";
    const path = `reports/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const buf = Buffer.from(await photo.arrayBuffer());
    const { error: upErr } = await sb.storage
      .from("bloomos-reports")
      .upload(path, buf, { contentType: photo.type || "application/octet-stream", upsert: false });
    if (upErr) {
      console.error("[report] photo upload failed:", upErr.message);
    } else {
      const { data: signed } = await sb.storage
        .from("bloomos-reports")
        .createSignedUrl(path, SIGNED_URL_TTL);
      photoUrl = signed?.signedUrl ?? null;
    }
  }

  // 2. Find or create the "BloomOS Upgrades" project.
  let projectId: string | null = null;
  const { data: existing } = await sb
    .from("ops_projects")
    .select("id")
    .eq("title", UPGRADES_PROJECT)
    .limit(1)
    .maybeSingle();
  if (existing) {
    projectId = existing.id as string;
  } else {
    const { data: created, error: projErr } = await sb
      .from("ops_projects")
      .insert({
        // 'product' is valid for tasks but NOT for ops_projects (its category
        // check is fundraising/admin/board/recruitment/program/finance/
        // compliance/other) — use 'other' so the project actually gets created.
        title: UPGRADES_PROJECT,
        category: "other",
        description: "Issues, confusions, and ideas captured from inside BloomOS via the Report button.",
        assigned_to: "remi",
        created_by: reporter,
      })
      .select("id")
      .single();
    if (projErr) console.error("[report] project create failed:", projErr.message);
    projectId = created?.id ?? null;
  }

  // 3. Create the task in that project.
  // When the guided bug flow produced a Claude Code prompt, the task description
  // IS that prompt (so copying the description = copying the paste-ready brief),
  // with the interview transcript + provenance appended below a divider for the
  // record. A 'claude-prompt' label flags it so the UI can offer a one-tap copy.
  const summaryLine = (reportTitle || description || `${meta.label} report`).split("\n")[0].trim();
  const title = `${meta.label}: ${summaryLine}`.slice(0, 140);
  const reporterLine = `Reported by ${reporter[0].toUpperCase()}${reporter.slice(1)} via the in-app reporter.`;

  let taskDescription: string;
  const labels = ["report", type];
  if (debugPrompt) {
    labels.push("claude-prompt");
    const transcriptBlock = transcript.length
      ? [
          "Interview:",
          ...transcript.map(
            (t) => `${t.role === "assistant" ? "Q" : "A"}: ${t.content.replace(/\n+/g, " ").trim()}`,
          ),
        ].join("\n")
      : "";
    taskDescription = [
      debugPrompt,
      "",
      "———",
      reporterLine,
      transcriptBlock,
      photoUrl ? `Screenshot: ${photoUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    taskDescription = [
      description || "(no description)",
      "",
      reporterLine,
      photoUrl ? `Photo: ${photoUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const { data: task, error: taskErr } = await sb
    .from("ops_tasks")
    .insert({
      title,
      description: taskDescription,
      category: "product",
      priority: type === "bug" ? "high" : "medium",
      assigned_to: "remi",
      created_by: reporter,
      project_id: projectId,
      labels,
      pinned_for_today: false,
    })
    .select("id")
    .single();
  if (taskErr) {
    console.error("[report] task create failed:", taskErr.message);
    return NextResponse.json({ error: "Could not save the report" }, { status: 500 });
  }
  if (projectId) {
    await sb.from("ops_projects").update({ last_touched_at: new Date().toISOString() }).eq("id", projectId);
  }

  // 4. Email both operators (best-effort — never block the report on it).
  const projectLink = projectId
    ? adminUrl(`/admin/ops/projects/${projectId}`)
    : adminUrl("/admin/ops");
  const promptBlock = debugPrompt
    ? `<p style="margin:8px 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6B6960;">Claude Code prompt (copy into Claude Code)</p>
       <pre style="white-space:pre-wrap;margin:0;padding:14px;background:#0E0E0E;color:#FAFAF8;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;">${esc(debugPrompt)}</pre>`
    : `<p style="white-space:pre-wrap;margin:8px 0 0;">${esc(description || "(no description)")}</p>`;
  const body = `
    <p style="margin:0 0 4px;"><span style="display:inline-block;font-weight:700;color:#E8500A;">${meta.emoji} ${meta.label}</span>
      <span style="color:#6B6960;"> · reported by ${esc(reporter)}</span></p>
    ${promptBlock}
    ${
      photoUrl
        ? `<div style="margin:16px 0;"><img src="${photoUrl}" alt="Report photo" style="max-width:100%;border-radius:12px;border:1px solid #F0EEE8;" /></div>`
        : ""
    }
    <p style="margin:16px 0 0;"><a href="${projectLink}" style="display:inline-block;background:#E8500A;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:8px 16px;border-radius:999px;">Open BloomOS Upgrades →</a></p>
  `;
  await sendOperatorEmail(`${meta.emoji} BloomOS report: ${summaryLine}`.slice(0, 120), operatorEmailShell("New BloomOS report", body)).catch(
    (e) => console.error("[report] email failed:", e)
  );

  return NextResponse.json({ ok: true, taskId: task.id, projectId });
}
