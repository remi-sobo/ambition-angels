// Spec Inbox X1 host (specs/bloomos-v2-spec-inbox.md, decision 1 — resolved:
// pure host): renders the V1 team chat at its V2 seat — the shell's LAST
// unbuilt merge seat, built. Pure re-export — same component, props flow
// through untouched, so ?t=<threadId> selects the open conversation exactly
// as it does on the V1 route (the stored notifications.url contract).
// The dark chrome travels inside the page; the gate lives in this dir's
// layout. /admin/messages 308s here at the X2 cutover.
export { default } from "@/app/admin/messages/page";
