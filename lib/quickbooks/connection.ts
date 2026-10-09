import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, toByteaHex, fromBytea } from "@/lib/crypto/secret-box";
import { upsertFinConfig } from "@/lib/admin/finance";
import {
  QboAuthError,
  fetchBankAccounts,
  fetchProfitAndLossDetail,
  isQboConfigured,
  refreshQboTokens,
  type QboTokens,
} from "./client";
import {
  fiscalYearToDateStart,
  pacificToday,
  parseBankAccounts,
  parseProfitAndLossDetail,
  type CashBalance,
  type RegisterLine,
} from "./register";

/**
 * The org's QuickBooks Online connection, one `connections` row
 * (provider 'quickbooks', external_id = realmId). Tokens are AES-256-GCM
 * encrypted (lib/crypto/secret-box). The last pull is cached on the row's meta
 * so pages render from the database, not from a live QBO round trip:
 *   meta.register  the to-date register (fiscal YTD), newest first
 *   meta.cash      cash in account + as-of date
 * The cash figure is also written to the fin_config anchor, which is what
 * makes it the base number for runway in getFinanceSnapshot.
 *
 * `connections` is service-path only (RLS deny-all): callers must already be
 * authed and pass the org they are scoped to.
 */

const PROVIDER = "quickbooks";
/** Bounds the cached register (jsonb) — far above a year of AA's books. */
const MAX_LINES = 5000;

export type QuickBooksRegister = { start: string; end: string; lines: RegisterLine[]; truncated: boolean };

export type QuickBooksStatus = {
  /** Intuit app keys present on the server. */
  configured: boolean;
  connected: boolean;
  /** Intuit rejected our grant (revoked / refresh token expired). */
  needsReconnect: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  register: QuickBooksRegister | null;
  cash: CashBalance | null;
};

type Row = {
  id: string;
  external_id: string;
  status: string;
  access_token_enc: unknown;
  refresh_token_enc: unknown;
  expires_at: string | null;
  meta: Record<string, unknown> | null;
};

async function loadRow(orgId: string): Promise<Row | null> {
  const { data } = await getSupabaseAdmin()
    .from("connections")
    .select("id, external_id, status, access_token_enc, refresh_token_enc, expires_at, meta")
    .eq("org_id", orgId)
    .eq("provider", PROVIDER)
    .in("status", ["active", "expired"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function patchRow(row: Row, fields: Record<string, unknown>, metaPatch: Record<string, unknown> = {}) {
  const meta = { ...(row.meta ?? {}), ...metaPatch };
  row.meta = meta;
  const { error } = await getSupabaseAdmin()
    .from("connections")
    .update({ ...fields, meta, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) throw new Error(`quickbooks connection update failed: ${error.message}`);
}

function tokenFields(t: QboTokens) {
  return {
    access_token_enc: toByteaHex(encryptSecret(t.accessToken)),
    refresh_token_enc: toByteaHex(encryptSecret(t.refreshToken)),
    expires_at: new Date(t.expiresAt).toISOString(),
  };
}

/** Store a freshly authorized company. One QBO company per org: connecting a
 *  different company replaces the old row. */
export async function saveQuickBooksConnection(args: {
  orgId: string;
  realmId: string;
  tokens: QboTokens;
  connectedBy: string;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb.from("connections").delete().eq("org_id", args.orgId).eq("provider", PROVIDER).neq("external_id", args.realmId);
  const { error } = await sb.from("connections").upsert(
    {
      org_id: args.orgId,
      provider: PROVIDER,
      external_id: args.realmId,
      ...tokenFields(args.tokens),
      status: "active",
      meta: {
        connected_by: args.connectedBy,
        connected_at: new Date().toISOString(),
        refresh_expires_at: new Date(args.tokens.refreshExpiresAt).toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider,external_id" }
  );
  if (error) throw new Error(`quickbooks connection upsert failed: ${error.message}`);
}

/** Connection + last pull for the Finance pages. Never decrypts tokens. */
export async function getQuickBooksStatus(orgId: string): Promise<QuickBooksStatus> {
  const row = await loadRow(orgId);
  const meta = row?.meta ?? {};
  return {
    configured: isQboConfigured(),
    connected: row?.status === "active",
    needsReconnect: row?.status === "expired",
    lastSyncAt: (meta.last_sync_at as string | undefined) ?? null,
    lastError: (meta.last_error as string | undefined) ?? null,
    register: (meta.register as QuickBooksRegister | undefined) ?? null,
    cash: (meta.cash as CashBalance | undefined) ?? null,
  };
}

/** A valid access token, refreshing (and persisting the rotated refresh
 *  token) when the current one is within two minutes of expiry. */
async function accessToken(row: Row): Promise<string> {
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token_enc && expiresAt > Date.now() + 120_000) {
    return decryptSecret(fromBytea(row.access_token_enc));
  }
  const tokens = await refreshQboTokens(decryptSecret(fromBytea(row.refresh_token_enc)));
  await patchRow(row, tokenFields(tokens), {
    refresh_expires_at: new Date(tokens.refreshExpiresAt).toISOString(),
  });
  return tokens.accessToken;
}

export type SyncResult =
  | { ok: true; lines: number; cash: number; asOf: string; anchorUpdated: boolean }
  | { ok: false; error: string; needsReconnect: boolean };

/**
 * Pull the two reads (register + cash) for one org and cache them. The cash
 * anchor only moves forward: a QBO balance dated before the current anchor
 * (e.g. one set by hand for a later date) never overwrites it.
 */
export async function syncQuickBooks(orgId: string): Promise<SyncResult> {
  const row = await loadRow(orgId);
  if (!row || row.status !== "active") {
    return { ok: false, error: "QuickBooks is not connected.", needsReconnect: row?.status === "expired" };
  }

  try {
    const token = await accessToken(row);
    const sb = getSupabaseAdmin();
    const { data: cfg } = await sb
      .from("fin_config")
      .select("fiscal_year_start_month, cash_starting_date")
      .eq("org_id", orgId)
      .maybeSingle();
    const today = pacificToday();
    const start = fiscalYearToDateStart(today, Number(cfg?.fiscal_year_start_month ?? 1));

    const [report, accounts] = await Promise.all([
      fetchProfitAndLossDetail(row.external_id, token, start, today),
      fetchBankAccounts(row.external_id, token),
    ]);
    const all = parseProfitAndLossDetail(report);
    const register: QuickBooksRegister = {
      start,
      end: today,
      lines: all.slice(0, MAX_LINES),
      truncated: all.length > MAX_LINES,
    };
    const cash = parseBankAccounts(accounts, today);

    await patchRow(row, {}, { register, cash, last_sync_at: new Date().toISOString(), last_error: null });

    const anchorDate = (cfg?.cash_starting_date as string | null | undefined) ?? null;
    const anchorUpdated = !anchorDate || anchorDate <= cash.asOf;
    if (anchorUpdated) {
      const { error } = await upsertFinConfig(orgId, {
        cash_starting_balance: cash.balance,
        cash_starting_date: cash.asOf,
        cash_reconciled_at: new Date().toISOString(),
      });
      if (error) throw new Error(`cash anchor update failed: ${error.message}`);
    }

    return { ok: true, lines: all.length, cash: cash.balance, asOf: cash.asOf, anchorUpdated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const needsReconnect = err instanceof QboAuthError;
    console.error(`[quickbooks] sync failed for org ${orgId}:`, msg);
    await patchRow(row, needsReconnect ? { status: "expired" } : {}, { last_error: msg }).catch(() => {});
    return { ok: false, error: msg, needsReconnect };
  }
}

/** Every org with an active QuickBooks connection (for the daily cron). */
export async function listQuickBooksOrgs(): Promise<string[]> {
  const { data } = await getSupabaseAdmin()
    .from("connections")
    .select("org_id")
    .eq("provider", PROVIDER)
    .eq("status", "active");
  return Array.from(new Set((data ?? []).map((r) => r.org_id as string)));
}
