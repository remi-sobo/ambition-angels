/**
 * Server-only reader for the Finance Model Google Sheet, via an Apps Script
 * Web App proxy.
 *
 * Why a Web App and not a service account: Workspace org policy on
 * ambitionangels.org blocks creation of service-account keys
 * (iam.disableServiceAccountKeyCreation), so the SA-with-JSON-key path
 * isn't available. Instead, the sheet itself hosts a bound Apps Script
 * deployed as a Web App; the script reads four specific cells and returns
 * them as JSON, gated by a shared-secret token. Our server-side loader
 * fetches that JSON.
 *
 * Security model:
 *   - The Web App URL is "anyone with the link", but the script rejects any
 *     request whose `token` query param doesn't match a Script Property
 *     SHARED_SECRET. Without the token, the URL leaks only the literal
 *     string "unauthorized".
 *   - The script reads ONLY the four mapped cells. Salaries on the same
 *     tab are never accessed by the script, so they cannot leak via this
 *     endpoint even if the token is compromised.
 *   - The rendered page is gated by the admin cookie via middleware.ts.
 *   - Token rotation: change SHARED_SECRET in Script Properties AND
 *     FINANCE_MODEL_WEBHOOK_TOKEN in Vercel. No redeploy of the script
 *     is needed.
 *
 * Caller is expected to be a server component with `revalidate = 3600`,
 * so this util fires at most ~1× per hour per deployment. Apps Script
 * cold starts (~1–3s) are tolerable at that frequency.
 *
 * The Apps Script source lives at scripts/finance-model-webhook.gs.
 */

export type FinanceModelData = {
  cashBalance: number | null;
  monthlyBurn: number | null;
  runwayMonths: number | null;
  fundingNeeded: number | null;
  fetchedAt: string; // ISO timestamp
  sheetUrl: string; // deep-link to the model tab for "View full model"
};

export type FinanceSheetStatus =
  | { kind: "ok"; data: FinanceModelData }
  | { kind: "not_configured"; missing: string[] }
  | { kind: "error"; message: string };

// Pinned: the tab gid Remi cares about. If the model tab ever moves, update
// both this and the cell references in scripts/finance-model-webhook.gs.
const MODEL_TAB_GID = 564859427;

function buildSheetUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${MODEL_TAB_GID}`;
}

/**
 * Coerce a raw Apps Script response value into a number. Apps Script's
 * Range.getValue() returns numbers as JS numbers when the cell holds a
 * number/formula, but strings when the cell holds text. Defensive parsing
 * lets us survive a user typing "$1.2M" into a numeric cell.
 */
function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    // Strip $, commas, whitespace, and trailing units like " months" or "/mo".
    const cleaned = raw.replace(/[$,\s]/g, "").replace(/[a-zA-Z/]+$/, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type WebhookPayload = {
  cashBalance?: unknown;
  monthlyBurn?: unknown;
  runwayMonths?: unknown;
  fundingNeeded?: unknown;
  error?: string;
};

export async function loadFinanceModel(): Promise<FinanceSheetStatus> {
  const url = process.env.FINANCE_MODEL_WEBHOOK_URL;
  const token = process.env.FINANCE_MODEL_WEBHOOK_TOKEN;
  const sheetId = process.env.FINANCE_SHEET_ID;

  const missing: string[] = [];
  if (!url) missing.push("FINANCE_MODEL_WEBHOOK_URL");
  if (!token) missing.push("FINANCE_MODEL_WEBHOOK_TOKEN");
  if (!sheetId) missing.push("FINANCE_SHEET_ID");
  if (missing.length > 0) return { kind: "not_configured", missing };

  // Build the fetch URL. Apps Script Web Apps serve at /macros/s/<id>/exec
  // and accept query params on doGet(e.parameter). We rely on the user
  // pasting the full deployment URL into FINANCE_MODEL_WEBHOOK_URL.
  const sep = url!.includes("?") ? "&" : "?";
  const fetchUrl = `${url}${sep}token=${encodeURIComponent(token!)}`;

  try {
    // No-store: we have our own page-level revalidate=3600 cache. We don't
    // want Next.js to layer an additional fetch cache on top — that would
    // make rotation/troubleshooting confusing.
    const res = await fetch(fetchUrl, {
      cache: "no-store",
      // Apps Script can be slow on cold start. 15s is generous but bounded
      // so a hung script doesn't pin a render forever.
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return {
        kind: "error",
        message: `Webhook returned HTTP ${res.status} ${res.statusText}`,
      };
    }

    const text = await res.text();
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(text) as WebhookPayload;
    } catch {
      // Apps Script returns an HTML error page when the script itself
      // throws (e.g. wrong tab name). Surface a clipped preview so the
      // error panel is actually useful for debugging.
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 200);
      return {
        kind: "error",
        message: `Webhook returned non-JSON: ${preview}${
          text.length > 200 ? "…" : ""
        }`,
      };
    }

    if (payload.error) {
      return { kind: "error", message: `Webhook error: ${payload.error}` };
    }

    return {
      kind: "ok",
      data: {
        cashBalance: parseNumber(payload.cashBalance),
        monthlyBurn: parseNumber(payload.monthlyBurn),
        runwayMonths: parseNumber(payload.runwayMonths),
        fundingNeeded: parseNumber(payload.fundingNeeded),
        fetchedAt: new Date().toISOString(),
        sheetUrl: buildSheetUrl(sheetId!),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: "error", message };
  }
}
