// Year scoping for the pipeline board (/admin/fundraising, `year` search
// param). Every entry — open asks included — is scoped by expected close
// date: a pledge dated to a future year stays hidden, and out of every total,
// until that year's filter is selected. Undated entries have no year to scope
// by, so they stay visible under every filter.

export type YearScopable = { expectedClose: string | null };

export function inYear(o: YearScopable, year: string): boolean {
  return year === "all" || !o.expectedClose || o.expectedClose.slice(0, 4) === year;
}

// Future calendar years (ascending) that have at least one dated entry —
// each gets its own filter tab so upcoming pledges can be planned separately.
export function futureCloseYears(opps: YearScopable[], currentYear: number): number[] {
  const years = new Set<number>();
  for (const o of opps) {
    const y = Number(o.expectedClose?.slice(0, 4));
    if (Number.isInteger(y) && y > currentYear) years.add(y);
  }
  return Array.from(years).sort((a, b) => a - b);
}
