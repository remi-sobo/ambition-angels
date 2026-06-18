import Link from "next/link";
import { getFires } from "@/lib/admin/overview/sources";
import { Widget } from "./shared";

// What's on fire — decisions only the CEO makes, each linking straight to the
// thing to act on. Hygiene/data items live in the Ops panel, not here.

export default async function FiresWidget({ className }: { className?: string }) {
  const fires = await getFires();

  return (
    <Widget title="On fire" className={className}>
      {fires.length === 0 ? (
        <p className="text-revenue text-sm font-medium">Nothing on fire — runway, deadlines, and top asks are all current.</p>
      ) : (
        <ul className="divide-y divide-hairline -my-1">
          {fires.map((f) => (
            <li key={f.id} className="py-2.5 flex items-start gap-3">
              <span
                className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${f.severity === "critical" ? "bg-expense" : "bg-orange"}`}
                aria-hidden
              />
              <Link href={f.href} className="min-w-0 flex-1 group">
                <span className="block text-sm font-medium text-ink-1 group-hover:text-orange transition-colors truncate">
                  {f.title}
                </span>
                <span className="block text-[11px] text-ink-2 truncate">{f.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
