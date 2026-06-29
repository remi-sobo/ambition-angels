import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendOperatorEmailTo, operatorEmailShell } from "@/lib/email/operator";

/**
 * The notifications spine's single write path. Every emitter (research runs,
 * task assignment, @mentions, …) calls notify() — none hand-rolls an insert
 * or an email — so the fan-out rules live in exactly one place.
 *
 * Server-only: it uses the service-role client (getSupabaseAdmin), which
 * bypasses RLS, so a notification can be written for ANY recipient from any
 * server context regardless of who is logged in. org_id and recipient_id are
 * always supplied by the caller from session — never a column default — so
 * notifications land in the right tenant.
 *
 * No emitter is wired yet (research is Phase 3); this just has to exist and
 * be correct.
 */

// The only types that also email. v1 emails research events specifically,
// because that's the case where the user has deliberately left the app and
// won't see an in-app badge. Everything else is in-app only until a
// per-type preferences UI exists.
export const EMAIL_TYPES = new Set<string>(["research.completed", "research.failed"]);

// Absolute base for links rendered into emails (relative /admin/* paths are
// useless in a mail client). Mirrors the origin used in operatorEmailShell.
const SITE_ORIGIN = "https://www.ambitionangels.org";

export type NotifyInput = {
  orgId: string;
  recipientId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  linkedLabel?: string | null;
  url?: string | null;
};

export type NotificationRow = {
  id: string;
  org_id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  linked_label: string | null;
  url: string | null;
  read_at: string | null;
  emailed_at: string | null;
  created_at: string;
};

/**
 * Insert one notification and, for EMAIL_TYPES, best-effort email the
 * recipient. The row is the source of truth: a failed (or impossible) email
 * never throws and never undoes the insert — it just leaves emailed_at null.
 * Returns the created row, or null if the insert itself failed.
 */
export async function notify(input: NotifyInput): Promise<NotificationRow | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("notifications")
    .insert({
      org_id: input.orgId,
      recipient_id: input.recipientId,
      actor_id: input.actorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linked_entity_type: input.linkedEntityType ?? null,
      linked_entity_id: input.linkedEntityId ?? null,
      linked_label: input.linkedLabel ?? null,
      url: input.url ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[notify] insert failed:", error?.message ?? "no row returned");
    return null;
  }

  const row = data as NotificationRow;

  if (EMAIL_TYPES.has(row.type)) {
    // Isolated so a send/lookup failure can only log — it can never bubble
    // up to the emitter or roll back the row we just wrote.
    await emailRecipient(row).catch((e) =>
      console.error("[notify] email fan-out threw:", e)
    );
  }

  return row;
}

/** Resolve the recipient's email, send, and stamp emailed_at on success. */
async function emailRecipient(row: NotificationRow): Promise<void> {
  const admin = getSupabaseAdmin();

  // Email isn't in profiles — it lives on the auth user, reachable only via
  // the service-role admin API.
  const { data, error } = await admin.auth.admin.getUserById(row.recipient_id);
  const email = data?.user?.email;
  if (error || !email) {
    console.error(
      "[notify] could not resolve recipient email:",
      row.recipient_id,
      error?.message ?? "no email on auth user"
    );
    return;
  }

  const href = row.url
    ? row.url.startsWith("/")
      ? SITE_ORIGIN + row.url
      : row.url
    : null;
  const linkHtml = href
    ? `<p style="margin-top:16px;"><a href="${href}" style="color:#E8500A;font-weight:600;text-decoration:none;">Open in BloomOS →</a></p>`
    : "";
  const bodyHtml = `${row.body ? `<p style="margin:0;">${row.body}</p>` : ""}${linkHtml}`;

  const ok = await sendOperatorEmailTo(email, row.title, operatorEmailShell(row.title, bodyHtml));
  if (!ok) {
    console.error("[notify] sendOperatorEmailTo returned false for", email);
    return;
  }

  await admin
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", row.id);
}
