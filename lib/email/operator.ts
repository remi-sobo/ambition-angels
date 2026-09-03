import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { adminUrl } from "@/lib/origins";

/**
 * Email to ONE org's operators. The recipient roster is that org's
 * owner/admin rows in org_email_allowlist — never the whole table. The
 * allowlist holds every tenant's operators side by side, so an unscoped read
 * here would mail one organization's grants, pipeline and compliance items to
 * another organization's admins (this happened in code once; see
 * tests/operator-email-scope.test.ts). Every roster lookup therefore takes the
 * org explicitly, and a caller with no org in scope is a bug, not a reason to
 * broadcast.
 *
 * Failure policy mirrors lib/audit.ts: notification sends must never break
 * the caller.
 */
export const OPERATOR_ROLES = ["owner", "admin"] as const;

export type AllowlistRow = { email: string; role: string; org_id: string };

/** Pure: the operator addresses for `orgId` out of a set of allowlist rows.
 *  Filters on org AND role, dedupes case-insensitively, keeps first spelling. */
export function selectOperatorRecipients(rows: readonly AllowlistRow[], orgId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (r.org_id !== orgId) continue;
    if (!(OPERATOR_ROLES as readonly string[]).includes(r.role)) continue;
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r.email.trim());
  }
  return out;
}

export async function getOperatorEmails(orgId: string): Promise<string[]> {
  if (!orgId) throw new Error("getOperatorEmails: orgId is required — operator rosters are per-org");
  const { data } = await getSupabaseAdmin()
    .from("org_email_allowlist")
    .select("email, role, org_id")
    .eq("org_id", orgId)
    .in("role", [...OPERATOR_ROLES]);
  // The query is already fenced; the pure filter is the belt to that brace.
  return selectOperatorRecipients((data ?? []) as AllowlistRow[], orgId);
}

/** One message to every operator of `orgId`. */
export async function sendOperatorEmail(orgId: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("sendOperatorEmail: RESEND_API_KEY not set");
    return false;
  }
  const to = await getOperatorEmails(orgId);
  if (to.length === 0) return false;
  return sendTo(key, to, subject, html);
}

// Single-recipient send — used when the body is personalised per operator
// (e.g. the assignee-scoped Monday digest) or addressed to a specific user
// (notifications). The caller is responsible for having resolved `to` inside
// the org whose data the body carries.
export async function sendOperatorEmailTo(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("sendOperatorEmailTo: RESEND_API_KEY not set");
    return false;
  }
  return sendTo(key, to, subject, html);
}

async function sendTo(key: string, to: string | string[], subject: string, html: string): Promise<boolean> {
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: "BloomOS · Ambition Angels <careers@mail.ambitionangels.org>",
      to,
      subject,
      html,
    });
    if (error) {
      console.error("sendOperatorEmail failed:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendOperatorEmail threw:", e);
    return false;
  }
}

/** Shared shell so the operator emails read as one product. */
export function operatorEmailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0E0E0E;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#E8500A;margin-bottom:6px;">BloomOS</div>
    <h1 style="font-size:20px;margin:0 0 16px;">${title}</h1>
    <div style="background:#ffffff;border:1px solid #F0EEE8;border-radius:16px;padding:20px;font-size:14px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <p style="font-size:11px;color:#6B6960;margin-top:16px;">
      The operating system for nonprofits ·
      <a href="${adminUrl()}" style="color:#E8500A;">Open BloomOS</a>
    </p>
  </div>
</body></html>`;
}

export const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
