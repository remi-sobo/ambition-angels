// Display helpers shared by the fundraising pages.

// A constituent with no name on file falls back to its email — the same thing
// HubSpot shows for a contact that is only an email address, and far more
// useful to a fundraiser than "Unnamed person". Callers that don't select
// emails simply omit the field and get the old behaviour.
export function constituentName(c: {
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails?: string[] | null;
}): string {
  const email = (c.emails ?? []).map((e) => (e ?? "").trim()).find(Boolean);
  if (c.type === "organization") return c.org_name?.trim() || email || "Unnamed organization";
  const name = [c.first_name, c.last_name]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || email || "Unnamed person";
}
