import { notFound } from "next/navigation";

// Quality Floor Q1 — the catch-all that routes any /admin/* URL matching no
// real route into app/admin/not-found.tsx, so dead links 404 inside the
// BloomOS shell instead of the framework default. Next matches every
// concrete and dynamic route first; this only fires for addresses nothing
// else claims.
export default function AdminCatchAll() {
  notFound();
}
