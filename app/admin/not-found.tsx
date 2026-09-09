import Link from "next/link";
import { TYPE } from "@/lib/admin/typeScale";

// Quality Floor Q1 — the admin 404, rendered inside the shell so a stale
// bookmark or mistyped URL never drops a user on the bare framework page
// with no way back. Reached via notFound() anywhere under /admin, including
// the [...not_found] catch-all for URLs matching no route at all. Every V1
// path has answered with a 308 since the rebuild — landing here means the
// URL never existed.
export default function AdminNotFound() {
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-2xl">
      <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-8">
        <h1 className={TYPE.pageTitle}>There&apos;s no page here</h1>
        <p className="mt-2 text-sm text-ink-2 leading-relaxed">
          This address doesn&apos;t match anything in BloomOS. Old links from before the
          redesign forward automatically, so this one was probably mistyped or never
          existed.
        </p>
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <Link
            href="/admin/today"
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark rounded-full px-4 py-2 transition-colors"
          >
            Back to Today
          </Link>
          <span className="text-[12px] text-ink-2">
            or press <kbd className="font-mono text-[11px] border border-outline rounded px-1">⌘K</kbd> to search
          </span>
        </div>
      </div>
    </div>
  );
}
