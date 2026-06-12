// Display helpers shared by the fundraising pages.

export function constituentName(c: {
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
}): string {
  if (c.type === "organization") return c.org_name || "Unnamed organization";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed person";
}
