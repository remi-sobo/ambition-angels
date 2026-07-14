// /ms annual pay refresh (specs/ms-career-library-v2.md: "it is a CSV
// download and a script. It runs once. It is not a service.").
//
// Fetches the BLS OEWS national zip server-side (this runtime has open
// egress; the dev sandbox does not), extracts the national xlsx, and
// applies A_MEDIAN / A_PCT90 per detailed SOC to ms_occupations through
// public.ms_apply_oews (service-role-only SQL function). Invoked manually
// once a year with the new vintage; never called by any product surface.
//
//   POST body: {"url": "https://www.bls.gov/oes/special-requests/oesm24nat.zip",
//               "vintage": "May 2024"}

import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "npm:xlsx@0.18.5";
import { createClient } from "npm:@supabase/supabase-js@2";

type WageRow = { soc: string; median: number | null; p90: number | null };

// OEWS wage cells: numbers, or "*" (no estimate), or "#" (>= the annual
// top code, $239,200 for May 2024 — stored as the top code; clue 7 renders
// it as "over $X", which is exactly what BLS means by it).
function parseWage(cell: unknown, topCode: number): number | null {
  if (typeof cell === "number" && Number.isFinite(cell)) return Math.round(cell);
  if (typeof cell === "string") {
    const cleaned = cell.replace(/[,$\s]/g, "");
    if (cleaned === "#") return topCode;
    if (/^\d+(\.\d+)?$/.test(cleaned)) return Math.round(parseFloat(cleaned));
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const { url, vintage } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !/^https:\/\/www\.bls\.gov\//.test(url)) {
    return new Response(JSON.stringify({ error: "url must be a bls.gov https url" }), { status: 400 });
  }
  if (typeof vintage !== "string" || !vintage.trim()) {
    return new Response(JSON.stringify({ error: "vintage required, e.g. 'May 2024'" }), { status: 400 });
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "*/*",
    },
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `BLS fetch failed: ${res.status}` }), { status: 502 });
  }
  const zipBuf = await res.arrayBuffer();

  const zip = await JSZip.loadAsync(zipBuf);
  const entryName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".xlsx"));
  if (!entryName) {
    return new Response(JSON.stringify({ error: "no xlsx inside the zip" }), { status: 422 });
  }
  const xlsxBuf = await zip.files[entryName].async("uint8array");
  const wb = XLSX.read(xlsxBuf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const topCode = 239200; // BLS annual wage top code, May 2024 release
  const wages: WageRow[] = [];
  for (const row of rows) {
    const group = String(row["O_GROUP"] ?? "").toLowerCase();
    const soc = String(row["OCC_CODE"] ?? "").trim();
    if (group !== "detailed" || !/^\d{2}-\d{4}$/.test(soc)) continue;
    wages.push({
      soc,
      median: parseWage(row["A_MEDIAN"], topCode),
      p90: parseWage(row["A_PCT90"], topCode),
    });
  }
  if (wages.length === 0) {
    return new Response(JSON.stringify({ error: "parsed zero detailed rows", entry: entryName }), { status: 422 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await supabase.rpc("ms_apply_oews", { rows: wages, vintage });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, parsed: wages.length, updated: data, entry: entryName, vintage }),
    { headers: { "Content-Type": "application/json" } }
  );
});
