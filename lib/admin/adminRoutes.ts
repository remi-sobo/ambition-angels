import { ADMIN_ROUTES } from "./adminRoutes.generated";

/**
 * Real 404s for unknown admin URLs (V4 Stage G; Phase 0 finding: unknown
 * /admin URLs answered HTTP 200 with the in-shell 404 screen).
 *
 * Why the middleware has to decide: app/admin/loading.tsx puts every admin
 * page inside a Suspense boundary, so the shell has streamed with status 200
 * before the [...not_found] catch-all can call notFound(). The middleware
 * runs first, so it checks the path against the generated route list and,
 * for an address no page claims, rewrites to the catch-all with status 404.
 * The person still sees app/admin/not-found.tsx inside the shell.
 *
 * Config redirects (next.config.mjs, the V1 308s) run before the middleware,
 * so old links never reach this check. Paths with a file extension in the
 * last segment (icons, the manifest) are left alone.
 *
 * PURE: no Next imports, so tests drive it directly.
 */

type Seg = { kind: "static"; value: string } | { kind: "dynamic" } | { kind: "catchall"; optional: boolean };

function parse(pattern: string): Seg[] {
  return pattern
    .split("/")
    .filter(Boolean)
    .map((s): Seg => {
      if (/^\[\[\.\.\..+\]\]$/.test(s)) return { kind: "catchall", optional: true };
      if (/^\[\.\.\..+\]$/.test(s)) return { kind: "catchall", optional: false };
      if (/^\[.+\]$/.test(s)) return { kind: "dynamic" };
      return { kind: "static", value: s };
    });
}

const PARSED = ADMIN_ROUTES.map(parse);

function matches(segs: Seg[], parts: string[]): boolean {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.kind === "catchall") return s.optional ? true : parts.length > i;
    if (i >= parts.length) return false;
    if (s.kind === "static" && s.value !== parts[i]) return false;
  }
  return parts.length === segs.length;
}

/** True when some admin page or route handler claims this path. */
export function isKnownAdminPath(pathname: string, routes: readonly Seg[][] = PARSED): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  let parts: string[];
  try {
    parts = clean.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  } catch {
    return false;
  }
  return routes.some((segs) => matches(segs, parts));
}

/** Should the middleware answer this admin path with a 404? */
export function isUnknownAdminPath(pathname: string): boolean {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return false;
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  if (last.includes(".")) return false;
  return !isKnownAdminPath(pathname);
}

/** Exposed for tests. */
export const __parseRoute = parse;
