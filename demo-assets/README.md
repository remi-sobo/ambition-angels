# demo-assets

Self-contained HTML bundles that are served **only** through an
authenticated route handler. This directory is deliberately outside
`public/`: anything in `public/` is served by Next.js with no middleware
and no auth, so a file placed there is world-readable no matter what
routes sit in front of it.

- `ambition-demo.html` — the My Ambition partner demo (student / teacher /
  administrator on one login). Served at `/demo/app` behind the shared
  `DEMO_PASSWORD` gate (see `app/demo/` and `lib/demo/auth.ts`). Shipped
  as-is from the design handoff; do not edit its copy or markup here.

Files in this directory are pulled into the serverless bundle via
`outputFileTracingIncludes` in `next.config.mjs`. If you add a bundle,
add its route there too, or it will 500 in production and work locally.
