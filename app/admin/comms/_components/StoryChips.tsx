import Badge, { type BadgeTone } from "../../_components/ui/Badge";
import type { ConsentState } from "@/lib/comms/consent";

/**
 * The one chip that says whether a story can be used and, if not, the one
 * thing in the way (worst first). Text carries the meaning; color only
 * repeats it (status never by color alone).
 */
export function storyChip(s: { status: string; consent_state: ConsentState | null; publishable: boolean }): {
  label: string;
  tone: BadgeTone;
} {
  if (s.status === "retired") return { label: "Retired", tone: "neutral" };
  if (s.consent_state === "revoked") return { label: "Consent revoked", tone: "danger" };
  if (s.consent_state === "expired") return { label: "Consent expired", tone: "danger" };
  if (s.consent_state === "none") return { label: "Needs consent", tone: "warning" };
  if (s.consent_state === "pending") return { label: "Consent requested", tone: "warning" };
  if (s.publishable) return { label: s.status === "used" ? "Used, ready again" : "Ready to use", tone: "success" };
  return { label: "Not approved yet", tone: "neutral" };
}

export default function StoryChip(props: { status: string; consent_state: ConsentState | null; publishable: boolean }) {
  const c = storyChip(props);
  return <Badge tone={c.tone}>{c.label}</Badge>;
}
