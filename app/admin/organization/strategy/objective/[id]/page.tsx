// Spec Org O1 host (specs/bloomos-v2-spec-organization.md, decision 1 —
// resolved: child hosts): renders the V1 objective detail at its Strategy
// seat. Pure re-export — same component, props flow through untouched. The
// module gate comes from the parent organization/strategy layout; the chip
// bar from this dir's own layout. /admin/strategic-plan/objective/[id] 308s
// here at the O2 cutover.
export { default } from "@/app/admin/strategic-plan/objective/[id]/page";
