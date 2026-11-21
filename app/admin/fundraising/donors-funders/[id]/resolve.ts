// Which id space a Donor 360 id belongs to. A failed read is not a missing
// record: it throws, so the admin error boundary (app/admin/error.tsx) shows
// its retry screen instead of the 404 page. Only a clean miss on both id
// spaces resolves to "missing".

type Read = { data: unknown; error: { message: string } | null };
export type Donor360Table = "constituents" | "fr_prospects";

// `read(table)` fetches the row with this id from that table (maybeSingle).
export async function resolveDonor360(
  read: (table: Donor360Table) => PromiseLike<Read>,
): Promise<"constituent" | "prospect" | "missing"> {
  const c = await read("constituents");
  if (c.data) return "constituent";
  if (c.error) throw new Error(`Donor 360: constituent read failed: ${c.error.message}`);

  const p = await read("fr_prospects");
  if (p.error) throw new Error(`Donor 360: prospect read failed: ${p.error.message}`);
  return p.data ? "prospect" : "missing";
}
