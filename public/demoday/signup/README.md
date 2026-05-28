# Demo Day signup form

A signup form for Demo Day, styled to match the **Ambition Angels** website
(ink background + dot texture, Big Shoulders Display headline, orange CTA, cream
form card) and sized up for an **iPad** kiosk (large type, 60px+ inputs, a 68px
submit button).

Submissions post to the site's **own API** — no third-party setup, no keys to
paste. Each signup is saved to Supabase and shows up in the admin.

- **Page:** `public/demoday/signup/index.html`
- **Live URL:** `https://www.ambitionangels.org/demoday/signup`
  (clean URL via a rewrite in `next.config.mjs`; the raw file also works at
  `/demoday/signup/index.html`)
- **Access:** public — unlike the lookbook (`/demoday`), this page is **not**
  password-gated, so supporters can reach it from a link or QR code.
- **Photo:** `/images/teens-group-phone.jpg` runs as a hero banner across the
  top of the card. Swap the `src` on `.hero img` to change it.
- **Fonts:** Big Shoulders Display, Poppins, DM Sans (Google Fonts).

---

## How it flows

```
public/demoday/signup/index.html
        │  POST (JSON)
        ▼
app/api/demoday/signup/route.ts ──► Supabase `demoday_signups` table
        │                          └► email notification to Remi (Resend, optional)
        ▼
/admin/demoday  →  "Signups" tab  (app/admin/demoday/DemoDaySignups.tsx)
        └─ list / table view + Export CSV  (reads /api/admin/demoday/signups)
```

Nothing to configure on the page itself — it posts to a same-origin endpoint,
so it works in `next dev` and in production with no keys.

---

## The data

Stored in the `demoday_signups` table (migration:
`supabase/migrations/create_demoday_signups.sql`):

| Column | Source on the form |
|---|---|
| `first_name` | First name (required) |
| `last_name` | Last name (required) |
| `email` | Email (required, validated) |
| `phone` | Phone (optional) |
| `company` | Company or organization (optional) |
| `title` | Role / title (optional) |
| `engagement` | "How would you like to engage?" checkboxes (text array) |
| `note` | Anything else? (optional) |
| `source` | Always `"Demo Day Signup"` |

The table has **RLS enabled with no policies** — all access goes through the
service-role key in `lib/supabase/admin.ts`, so the public anon key can't read
these supporter contacts. The admin list route checks the `admin_auth` cookie.

### Engagement options
Defined in two places that must stay in sync:
- the checkboxes in `index.html`
- the `ENGAGEMENT_OPTIONS` whitelist in `app/api/demoday/signup/route.ts`
  (values outside the list are dropped)

Current options: *As a potential funder*, *As a connector*, *As a mentor*,
*Just staying informed*.

---

## Email notifications

If `RESEND_API_KEY` is set, each submission emails a summary to
`DEMODAY_NOTIFY_EMAIL` (defaults to `remi@ambitionangels.org`). Missing key →
notifications are skipped silently; the signup is still saved.

---

## Test locally

```bash
npm run dev
```

Open <http://localhost:3000/demoday/signup>, submit, then check
<http://localhost:3000/admin/demoday> → **Signups** tab. Requires
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your env for the
write to land.

---

## Editing copy

- **Header** (`<h1>`): currently *"Be part of what's next."* — the *"what's
  next."* line carries the orange `.accent` span.
- **Subcopy**: the `<p class="subcopy">` is marked `EDIT ME`.
- **CTA**: the button label *"Count me in"* lives in the markup and in
  `setLoading()` — change both.
- **Success message**: the `<h2>` (*"You're in."*) and `<p>` in `#successPanel`.
- **Hero photo**: the `<img>` inside `.hero`.
