// Pure pledge-schedule helpers (Epic F). Kept side-effect-free so the API
// route and any future tests can share them.

export type PledgeFrequency = "weekly" | "monthly" | "quarterly" | "annually";

function addInterval(startISO: string, freq: PledgeFrequency, n: number): string {
  const d = new Date(startISO + "T00:00:00");
  if (freq === "weekly") d.setDate(d.getDate() + 7 * n);
  else if (freq === "monthly") d.setMonth(d.getMonth() + n);
  else if (freq === "quarterly") d.setMonth(d.getMonth() + 3 * n);
  else d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the installment schedule for a pledge. Each installment is
 * total/count, rounded to cents; the final installment absorbs any rounding
 * remainder so the schedule sums exactly to the total.
 */
export function buildSchedule(opts: {
  total: number;
  count: number;
  frequency: PledgeFrequency;
  startDate: string;
}): Array<{ due_date: string; expected_amount: number }> {
  const { total, count, frequency, startDate } = opts;
  const per = Math.round((total / count) * 100) / 100;
  const out: Array<{ due_date: string; expected_amount: number }> = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const amount = i === count - 1 ? Math.round((total - allocated) * 100) / 100 : per;
    allocated = Math.round((allocated + amount) * 100) / 100;
    out.push({ due_date: addInterval(startDate, frequency, i), expected_amount: amount });
  }
  return out;
}
