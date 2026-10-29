/**
 * Thank-you display helpers. CLIENT-SAFE: no imports, so the Needs-you popout
 * (a client component) can format amounts and dates without pulling the
 * server-only stewardship engine into the browser bundle. todayAck.ts
 * re-exports these for server callers.
 */

export function ordinalLabel(n: number): string {
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix} gift`;
}

export function ackAmount(amount: number): string {
  const whole = Math.round(amount) === amount;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** "Jun 26" (adds the year only when it isn't the current one). */
export function ackShortDate(dateISO: string, today: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return dateISO.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${y}`;
}
