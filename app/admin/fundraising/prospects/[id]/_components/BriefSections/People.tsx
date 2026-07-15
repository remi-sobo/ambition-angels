import type { BriefContent, Person } from "@/lib/agents/funder-research/types";
import { TYPE } from "@/lib/admin/typeScale";

function PersonCard({ p }: { p: Person }) {
  return (
    <div className="rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-3">
      <div className={`font-medium ${TYPE.body}`}>{p.name}</div>
      {p.title && <div className="text-xs text-ink-2 mt-0.5">{p.title}</div>}
      {p.professional_background && (
        <div className="text-xs text-ink-2 mt-2 leading-relaxed">
          {p.professional_background}
        </div>
      )}
      {p.connection_to_youth_education_bayarea && (
        <div className="text-xs text-orange/80 mt-2 leading-relaxed">
          ↗ {p.connection_to_youth_education_bayarea}
        </div>
      )}
    </div>
  );
}

export default function People({
  data,
  defaultOpen = false,
}: {
  data: BriefContent["people"];
  defaultOpen?: boolean;
}) {
  const hasAny =
    data.primary_contact ||
    data.board_members.length > 0 ||
    data.staff_of_note.length > 0;

  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-card border-[1.5px] border-outline bg-surface p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-ink-2 hover:text-ink-1">
        People
      </summary>

      <div className="mt-4 space-y-5">
        {!hasAny && (
          <p className="text-sm text-ink-2 italic">No people surfaced.</p>
        )}

        {data.primary_contact && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Primary contact
            </div>
            <PersonCard p={data.primary_contact} />
          </div>
        )}

        {data.board_members.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Board members
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.board_members.map((p, i) => (
                <PersonCard key={i} p={p} />
              ))}
            </div>
          </div>
        )}

        {data.staff_of_note.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Staff of note
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.staff_of_note.map((p, i) => (
                <PersonCard key={i} p={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
