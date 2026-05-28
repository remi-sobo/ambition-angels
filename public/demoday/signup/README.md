# Demo Day donor signup form

A static, dependency-free signup form for the Fast Forward Demo Day. It posts
directly to HubSpot via the [Forms Submissions API][api] — no backend, no
build step.

- **File:** `public/demoday/signup/index.html`
- **Live URL:** `https://www.ambitionangels.org/demoday/signup`
  (clean URL via a rewrite in `next.config.mjs`; the raw file also works at
  `/demoday/signup/index.html`)
- **Access:** public — unlike the lookbook (`/demoday`), this page is **not**
  password-gated, so donors can reach it from a link or QR code.
- **Fonts:** loaded from `/demoday/fonts.css` (the same Owners / Owners Text /
  Forma DJR Mono brand faces used by the lookbook).

[api]: https://developers.hubspot.com/docs/api/marketing/forms

---

## 1. Paste your HubSpot IDs

Open `index.html` and find the `HUBSPOT` config object near the top of the
`<script>` block:

```js
const HUBSPOT = {
  PORTAL_ID: "YOUR_PORTAL_ID",
  FORM_GUID: "YOUR_FORM_GUID",
};
```

- **`PORTAL_ID`** (a.k.a. Hub ID) — your numeric HubSpot account ID.
  Find it under **Settings → Account Management → Account Defaults**, or read
  it from the URL after login: `app.hubspot.com/contacts/<PORTAL_ID>/...`.
- **`FORM_GUID`** — the ID of the HubSpot form (see step 2). After you create
  and save the form, the GUID is the long id that appears in the form's
  embed/share URL and in the submission endpoint:
  `.../submit/<PORTAL_ID>/<FORM_GUID>`.

The submission endpoint is assembled automatically:

```
https://api.hsforms.com/submissions/v3/integration/submit/{PORTAL_ID}/{FORM_GUID}
```

---

## 2. Create the form in HubSpot with these fields

In HubSpot: **Marketing → Forms → Create form** (a regular / embed form works).
Add fields with these **internal names** (the on-screen label can be anything).
The form will only accept fields it knows about, so every name below must exist.

| Form field (internal name) | Type | Source on the page |
|---|---|---|
| `firstname` | Default contact property | First name (required) |
| `lastname`  | Default contact property | Last name (required) |
| `email`     | Default contact property | Email (required, validated) |
| `phone`     | Default contact property | Phone (optional) |
| `company`   | Default contact property | Company or organization (optional) |
| `jobtitle`  | Default contact property | Role / title (optional) |
| `engagement_interests` | **Custom — Multi-line text** | "How would you like to engage?" checkboxes, joined with `"; "` |
| `signup_note` | **Custom — Multi-line text** | Optional note |
| `signup_source` | **Custom — Single-line text** | Always sent as `"Demo Day Signup"` |

### Notes
- **`engagement_interests`** receives a single semicolon-separated string, e.g.
  `Make a gift; Mentor a teen`. Use **Multi-line text** (not a checkbox /
  enumeration property) so it accepts free-form values.
- **`signup_source`** is the hidden field for segmentation. Filter or build a
  list on `signup_source is "Demo Day Signup"` to isolate these contacts.
- To create a custom property: **Settings → Properties → Create property**
  (object: Contact), then add it to the form.
- Empty optional fields are omitted from the payload (HubSpot rejects empty
  values for some property types), so only filled-in fields are sent.

---

## 3. Test locally

From the repo root:

```bash
npm run dev
```

Then open <http://localhost:3000/demoday/signup>.

- **Before** pasting real IDs: submitting logs a config warning to the console
  and shows the inline error — useful for checking the UI without hitting
  HubSpot.
- **After** pasting real IDs: a real submission will create/update a contact.
  Open DevTools → Network and watch the `submit/...` request; a **200** means
  success and the form is replaced with *"Thanks. We'll be in touch soon."*
- The Forms API allows submissions from any origin (CORS is open), so
  `localhost` submissions work the same as production.
- Force the error path by temporarily setting `FORM_GUID` to a bad value — you
  should see the red banner with a working **Try again** link.

---

## 4. Verify a submission landed in HubSpot

1. In HubSpot go to **CRM → Contacts** and search the email you submitted.
2. Open the contact and confirm `firstname`, `lastname`, `phone`, `company`,
   `jobtitle`, `engagement_interests`, `signup_note`, and `signup_source` are
   populated as expected.
3. Or open the form itself → **Submissions** tab to see the raw entry.
4. `signup_source = "Demo Day Signup"` is your filter for reporting and lists.

---

## Editing copy

- **Header** (`<h1>`): currently *"Be part of what's next."*
- **Subcopy**: the `<p class="subcopy">` is marked `EDIT ME` — swap freely.
- **CTA**: the button label *"Count me in"* lives in the markup and in the
  `setLoading()` function (it's reset there after submitting) — change both.
- **Success message**: the `<h2>` inside `#successPanel`.
