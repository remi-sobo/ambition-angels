import { Resend } from "resend";
import type { IntakeOrg } from "./types";

/**
 * Operator notifications for intake. These moved here from the public form
 * routes because BloomOS knows the admin links. The confirmation email to the
 * person who filled in the form stays on the website (it's the website's
 * voice), except Ambition Coach, whose confirmation carries a private
 * BloomOS link only BloomOS can make.
 *
 * Who gets the alert: orgs.settings.intake_notify_email when set. For the
 * resident org (the one whose forms these were before the split) the old env
 * overrides still apply, so nothing changes for Ambition Angels on day one.
 * Any other org with no setting gets no alert rather than someone else's.
 */

export const DEFAULT_FROM = "Ambition Angels <careers@mail.ambitionangels.org>";
const RESIDENT_FALLBACK = "remi@ambitionangels.org";

function isResident(org: IntakeOrg): boolean {
  return org.slug === (process.env.RESIDENT_ORG_SLUG || "ambition-angels");
}

export function notifyAddress(
  org: IntakeOrg,
  envOverride?: "INTAKE_NOTIFY_EMAIL" | "YGB_NOTIFY_EMAIL" | "DEMODAY_NOTIFY_EMAIL",
): string | null {
  const configured = org.settings?.intake_notify_email;
  if (typeof configured === "string" && configured.includes("@")) return configured;
  if (!isResident(org)) return null;
  return (envOverride && process.env[envOverride]) || process.env.INTAKE_NOTIFY_EMAIL || RESIDENT_FALLBACK;
}

export function fromAddress(org: IntakeOrg): string {
  const configured = org.settings?.intake_from_email;
  return typeof configured === "string" && configured.includes("@") ? configured : DEFAULT_FROM;
}

type Mail = { to: string; subject: string; html?: string; text?: string; replyTo?: string; from?: string };

/** Send and swallow. A failed email never fails an intake that already saved. */
export async function sendMail(org: IntakeOrg, mail: Mail): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { from, ...rest } = mail;
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: from ?? fromAddress(org),
      ...rest,
    } as Parameters<Resend["emails"]["send"]>[0]);
  } catch (err) {
    console.error("[intake] email failed:", err instanceof Error ? err.message : err);
  }
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const clean = (v: unknown, max = 500): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
