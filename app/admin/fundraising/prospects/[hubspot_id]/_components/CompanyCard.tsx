export type HsCompany = {
  hubspot_id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CompanyCard({
  company,
  rawCompanyName,
}: {
  company: HsCompany | null;
  rawCompanyName: string | null;
}) {
  return (
    <section className="rounded-card border-[1.5px] border-outline bg-black/30 p-6">
      <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
        Associated Company
      </h2>

      {!company ? (
        rawCompanyName ? (
          <div className="text-sm">
            <div className="text-ink-1 font-semibold">{rawCompanyName}</div>
            <div className="text-xs text-ink-2 mt-1">
              Not in synced company records.
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-2">No company on file.</p>
        )
      ) : (
        <div className="space-y-3">
          <div className="text-ink-1 font-semibold text-base">
            {company.name ?? "—"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Domain">
              {company.domain ? (
                <a
                  href={`https://${company.domain.replace(/^https?:\/\//, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange hover:underline"
                >
                  {company.domain}
                </a>
              ) : (
                <span className="text-ink-2">—</span>
              )}
            </Field>
            <Field label="Industry">
              <span className="text-ink-1">{company.industry ?? "—"}</span>
            </Field>
            <Field label="Owner ID">
              <span className="text-ink-1 font-mono text-xs">
                {company.owner_id ?? "—"}
              </span>
            </Field>
            <Field label="Last Activity">
              <span className="text-ink-1">
                {fmtDate(company.last_activity_at)}
              </span>
            </Field>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
