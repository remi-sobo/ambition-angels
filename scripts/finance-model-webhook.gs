/**
 * Finance Model webhook — Apps Script source.
 *
 * Bound to the "Ambition s26 Financial Model" spreadsheet. Deployed as a
 * Web App that returns the four headline KPIs from the "Actual current
 * Summary" tab as JSON, guarded by a shared secret. Consumed by
 * lib/google/finance-sheet.ts in the Next.js admin.
 *
 * Why this exists: the org blocks service-account key creation, so the
 * standard "SA reads sheet via googleapis" path isn't available. This is
 * the org-policy-safe alternative — the script runs as the sheet owner
 * inside Google's own infrastructure, and only the four mapped values
 * cross the network boundary. The "Salary" tab (and any other tab) is
 * never touched by this script.
 *
 * ── Setup ────────────────────────────────────────────────────────────────
 *   1. Open the model sheet → Extensions → Apps Script.
 *   2. Replace Code.gs with this file's contents.
 *   3. (Already done) TAB_GID below matches the "Actual current Summary"
 *      tab. Cell refs below match the labels D6–D9 as of June 2026.
 *   4. Project Settings (gear icon) → Script Properties → Add script
 *      property → SHARED_SECRET = (32+ random chars). The same value goes
 *      into Vercel as FINANCE_MODEL_WEBHOOK_TOKEN.
 *   5. Deploy → New deployment → ⚙ → Web app:
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
 *   No script redeploy needed if the deployment is "Head" (default).
 */

// The gid of the "Actual current Summary" tab. Looked up by gid (not name)
// so the script keeps working if the tab is renamed. If you reorganize the
// model and want to point this at a different tab, get the new gid from the
// URL fragment when that tab is selected (`#gid=NNNNNNNN`) and update both
// this and MODEL_TAB_GID in lib/google/finance-sheet.ts.
const TAB_GID = 564859427;

// A1-style cell refs on the summary tab. Currently the 2026 column (D);
// the 2027 forecast lives in column E if you ever want to toggle years.
// Labels for context — must stay in sync with FinanceModelData fields in
// lib/google/finance-sheet.ts.
const CELLS = {
  fundingSurvival: 'D6',         // Additional fundraising needed within year (for survival)
  fundingThreeMonthRunway: 'D7', // Additional fundraising needed (assuming 3 months runway)
  totalExpenses: 'D8',           // Total expenses within year
  monthlyBurn: 'D9',             // Monthly burn rate at year end
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

    const sheet = getSheetByGid(TAB_GID);
    if (!sheet) {
      return json({ error: 'tab with gid ' + TAB_GID + ' not found' });
    }

    // Read each mapped cell explicitly. Do NOT read whole ranges or the
    // active range — the contract is that this script only ever touches
    // the four cells named in CELLS.
    const payload = {
      fundingSurvival: readCell(sheet, CELLS.fundingSurvival),
      fundingThreeMonthRunway: readCell(sheet, CELLS.fundingThreeMonthRunway),
      totalExpenses: readCell(sheet, CELLS.totalExpenses),
      monthlyBurn: readCell(sheet, CELLS.monthlyBurn),
    };
    return json(payload);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) });
  }
}

function getSheetByGid(gid) {
  const sheets = SpreadsheetApp.getActive().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
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
