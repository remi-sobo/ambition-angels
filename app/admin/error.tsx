"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

// Quality Floor Q1 — the route-level error boundary every admin route
// inherits. Renders inside the shell (the sidebar and tab zone survive the
// throw), gives a working retry, and a way home.
//
// The spec's second failure mode is this boundary SWALLOWING observability:
// it must report before it renders. Next.js already logs the server-side
// throw with the same digest on the server console/platform logs — the
// digest below is the join key, so a friendly screen never hides an
// incident.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    // Report BEFORE the friendly render is the contract (DoD 1): the digest
    // ties this client log line to the server-side stack Next already
    // captured for the same throw.
    console.error(
      `[admin-error] route=${pathname} digest=${error.digest ?? "none"}`,
      error,
    );
  }, [error, pathname]);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-2xl">
      <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-8">
        <h1 className={TYPE.pageTitle}>Something broke on this page</h1>
        <p className="mt-2 text-sm text-ink-2 leading-relaxed">
          The rest of BloomOS is fine — this screen hit an error while loading. Retrying
          usually clears it; if it keeps happening, the error is already in the logs
          {error.digest ? (
            <>
              {" "}
              (reference <span className="font-mono text-[12px]">{error.digest}</span>)
            </>
          ) : null}
          .
        </p>
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => reset()}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark rounded-full px-4 py-2 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/admin/today"
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
          >
            Back to Today
          </Link>
        </div>
      </div>
    </div>
  );
}
