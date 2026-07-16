import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { adminUrl } from "@/lib/origins";

/**
 * Email to the org's operators (the allowlist is the recipient roster —
 * owner/admin emails, currently Remi + Shannon). Used by the daily
 * deadline reminders and the Monday digest. Failure policy mirrors
 * lib/audit.ts: notification sends must never break the caller.
 */
export async function getOperatorEmails(): Promise<string[]> {
  const { data } = await getSupabaseAdmin()
    .from("org_email_allowlist")
    .select("email, role")
    .in("role", ["owner", "admin"]);
  return (data ?? []).map((r) => r.email);
}

export async function sendOperatorEmail(subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("sendOperatorEmail: RESEND_API_KEY not set");
    return false;
  }
  const to = await getOperatorEmails();
  if (to.length === 0) return false;
  return sendTo(key, to, subject, html);
}

// Single-recipient send — used when the body is personalised per operator
// (e.g. the assignee-scoped Monday digest).
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
