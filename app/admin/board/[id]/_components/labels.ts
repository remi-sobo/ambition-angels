// Board officer-role labels. A plain module (no "use client") so the server
// member page and the client controls can both read it: a Server Component
// that reads a constant out of a "use client" file gets a client reference
// and throws (tests/client-boundary.test.ts).

export const ROLE_LABELS: Record<string, string> = {
  chair: "Chair",
  vice_chair: "Vice Chair",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member: "Member",
};
