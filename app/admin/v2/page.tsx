import { getOrgContext } from "@/lib/admin/auth";
import { getV2ShellEnabled } from "@/lib/admin/v2shell";
import { TYPE } from "@/lib/admin/typeScale";
import V2ShellToggle from "./V2ShellToggle";

// Spec B, stage B3 — the V2 shell switch. A quiet standalone page (linked
// from the V2 sidebar footer; reachable by URL from V1 so the first flip
// doesn't need a V1 chrome change — DoD 8 keeps V1 byte-for-byte). The flag
// is PER-USER: flipping it here changes only your own chrome, on every
// device, and is reversible from the same page.
export default async function V2ShellPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <h1 className={TYPE.pageTitle}>V2 shell</h1>
        <p className="text-ink-2 mt-1">Sign in to manage your shell preference.</p>
      </div>
    );
  }
  const enabled = await getV2ShellEnabled();
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[640px]">
      <h1 className={TYPE.pageTitle}>V2 shell</h1>
      <p className={`${TYPE.bodyMuted} mt-2`}>
        The BloomOS V2 shell — seven destinations, one tab row — is rolling out
        destination by destination. This switch is yours alone: it changes what
        <em> you</em> see on every device, and nothing for anyone else. Every
        screen keeps working under both shells, and every old link keeps
        resolving.
      </p>
      <div className="mt-6">
        <V2ShellToggle enabled={enabled} />
      </div>
    </div>
  );
}
