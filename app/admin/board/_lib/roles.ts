// Plain (non-"use client") board constants. Server Components (the member
// profile page) index into these VALUES, which breaks in the production bundle
// when they live in a "use client" module — same reason as
// app/admin/partners/_lib/partners.ts.

export const ROLE_LABELS: Record<string, string> = {
  chair: "Chair",
  vice_chair: "Vice Chair",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member: "Member",
};
