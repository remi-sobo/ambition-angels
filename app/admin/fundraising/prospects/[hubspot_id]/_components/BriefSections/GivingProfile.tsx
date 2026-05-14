import type { BriefContent } from "@/lib/agents/funder-research/types";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-1">
        {label}
      </div>
      <div className="text-sm text-cream/85">
        {value ?? <span className="text-gray-mid italic">unknown</span>}
      </div>
    </div>
  );
}

export default function GivingProfile({
  data,
  defaultOpen = false,
}: {
  data: BriefContent["giving_profile"];
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-card border border-white/10 bg-black/30 p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-gray-mid hover:text-cream">
        Giving profile
      </summary>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Annual giving" value={data.annual_giving} />
        <Field label="Grant size range" value={data.grant_size_range} />
        <Field label="Decision cadence" value={data.decision_cadence} />
        <Field label="Application process" value={data.application_process} />
      </div>
    </details>
  );
}
