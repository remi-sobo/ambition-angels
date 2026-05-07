export default function FundraisingPage() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-semibold">Fundraising</h1>
      <p className="mt-2 text-zinc-400">
        Prospects, plan performance, brief, asks.
      </p>
      <p className="mt-6 text-sm text-zinc-500">
        Prospect list coming in PR 8. For now, visit{" "}
        <code className="text-cream/80 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs">
          /admin/fundraising/prospects/[hubspot_id]
        </code>{" "}
        directly with a real HubSpot contact ID.
      </p>
    </div>
  );
}
