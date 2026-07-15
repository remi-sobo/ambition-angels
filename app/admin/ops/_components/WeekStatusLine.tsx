import type { WeekStatus } from "@/lib/admin/ops/statusLine";

/**
 * Renders a deterministic rhythm status (lib/admin/ops/status.ts). Flared
 * segments warm-color, but the flare is also the non-zero / tight thing, so the
 * line reads the same in grayscale. Shared by the My Week hub and the wizard's
 * orient step so the sentence is identical in both places.
 */
export default function WeekStatusLine({ status }: { status: WeekStatus }) {
  return (
    <p className="text-lg sm:text-xl text-ink-1 leading-snug">
      <span className="text-ink-2">This week: </span>
      {status.segments.map((seg, i) => (
        <span key={seg.key}>
          <span className={seg.flare ? "font-semibold text-[#A56A1B]" : "text-ink-1"}>
            {seg.text}
          </span>
          {i < status.segments.length - 1 ? <span className="text-ink-3">, </span> : "."}
        </span>
      ))}
    </p>
  );
}
