/**
 * Finance Model webhook — Apps Script source.
 *
 * Bound to the Finance Model spreadsheet (FINANCE_SHEET_ID). Deployed as a
 * Web App that returns the four headline KPIs as JSON, guarded by a shared
 * secret. Consumed by lib/google/finance-sheet.ts in the Next.js admin.
 *
 * Why this exists: the org blocks service-account key creation, so the
 * standard "SA reads sheet via googleapis" path isn't available. This is
 * the org-policy-safe alternative — the script runs as the sheet owner
 * inside Google's own infrastructure, and only the four mapped values
 * cross the network boundary.
 *
 * ── Setup ────────────────────────────────────────────────────────────────
 *   1. Open the model sheet → Extensions → Apps Script.
 *   2. Replace Code.gs with this file's contents.
 *   3. Update TAB_NAME and CELLS below to match your sheet.
 *   4. Project Settings → Script Properties → add SHARED_SECRET (32+ random
 *      chars). The same value goes into Vercel as FINANCE_MODEL_WEBHOOK_TOKEN.
 *   5. Deploy → New deployment → Web app:
 *        Execute as: Me
 *        Who has access: Anyone with the link
 *      Copy the /macros/s/.../exec URL into Vercel as FINANCE_MODEL_WEBHOOK_URL.
 *
 * ── Rotating the secret ──────────────────────────────────────────────────
 *   Change SHARED_SECRET in Script Properties AND FINANCE_MODEL_WEBHOOK_TOKEN
 *   in Vercel. No redeploy of the script needed; the next request picks up
 *   the new value.
 *
 * ── Adding a metric ──────────────────────────────────────────────────────
 *   1. Add a new entry to CELLS below.
 *   2. Add the matching field to FinanceModelData + parseNumber in
 *      lib/google/finance-sheet.ts.
 *   3. Add a Card in app/admin/finance/model/page.tsx.
 *   No script redeploy needed if the deployment is configured as
 *   "Head deployment" (default for new web apps).
 */

// The visible TITLE of the tab whose gid is 564859427. The Sheets API and
// SpreadsheetApp address tabs by name, not gid. If you don't know the
// title, open the sheet, look at the tab at the bottom, type that string
// here EXACTLY (case-sensitive, spaces matter).
const TAB_NAME = 'TODO_TAB_TITLE';

// A1-style cell refs on TAB_NAME. Update each placeholder with the actual
// cell that holds the metric. Order doesn't matter — keys must match the
// FinanceModelData fields in lib/google/finance-sheet.ts.
const CELLS = {
  cashBalance: 'TODO_A1',
  monthlyBurn: 'TODO_A1',
  runwayMonths: 'TODO_A1',
  fundingNeeded: 'TODO_A1',
};

/**
 * Web app entry point. Apps Script invokes this on every GET to the
 * deployment URL. Returns JSON in all cases — never HTML — so the Next.js
 * caller can parse without ambiguity.
 */
function doGet(e) {
  try {
    const expected = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!expected) {
      return json({ error: 'SHARED_SECRET not set in Script Properties' });
    }
    const provided = (e && e.parameter && e.parameter.token) || '';
    if (provided !== expected) {
      return json({ error: 'unauthorized' });
    }

    const sheet = SpreadsheetApp.getActive().getSheetByName(TAB_NAME);
    if (!sheet) {
      return json({ error: 'tab not found: ' + TAB_NAME });
    }

    // Read each mapped cell explicitly. Do NOT read whole ranges or the
    // active range — the salary cells must never be touched by this script
    // so they cannot leak through this endpoint.
    const payload = {
      cashBalance: readCell(sheet, CELLS.cashBalance),
      monthlyBurn: readCell(sheet, CELLS.monthlyBurn),
      runwayMonths: readCell(sheet, CELLS.runwayMonths),
      fundingNeeded: readCell(sheet, CELLS.fundingNeeded),
    };
    return json(payload);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) });
  }
}

function readCell(sheet, ref) {
  if (!ref || ref.indexOf('TODO_') === 0) {
    throw new Error('cell ref not configured: ' + ref);
  }
  return sheet.getRange(ref).getValue();
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
