import type { FinCategory } from "@/lib/finance/types";

/** The org's categories as <optgroup>s by group_name, in sort order. Shared by
 *  the row picker, the filter row and the bulk "Categorize as" menu. */
export function groupCategories(categories: FinCategory[]): Array<{ name: string; items: FinCategory[] }> {
  const groups: Array<{ name: string; items: FinCategory[] }> = [];
  for (const c of categories) {
    let g = groups.find((x) => x.name === c.group_name);
    if (!g) {
      g = { name: c.group_name, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }
  return groups;
}

export default function CategoryOptions({ categories }: { categories: FinCategory[] }) {
  return (
    <>
      {groupCategories(categories).map((g) => (
        <optgroup key={g.name} label={g.name}>
          {g.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
