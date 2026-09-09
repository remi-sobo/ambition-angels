// Spec Org O1 host (specs/bloomos-v2-spec-organization.md, decision 1 —
// resolved: child hosts): renders the V1 monthly review at its Strategy
// seat. Pure re-export — same component, props flow through untouched. The
// module gate comes from the parent organization/strategy layout; the chip
// bar from this dir's own layout. /admin/strategic-plan/review 308s here at
// the O2 cutover.
export { default } from "@/app/admin/strategic-plan/review/page";
