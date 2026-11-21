// BloomOS V4 audit harness fixtures: one made-up org, "Ambition Angels (demo)".
//
// Every person, donor, school, company, amount and note here is invented.
// Rows are generated deterministically (seeded PRNG) with dates relative to
// "now", so lists look current on any day. Column sets come from
// schema.json (dumped from the repo's migrations by e2e/v4/dump-schema.sh);
// every generated row is completed with all schema columns, so filters on any
// real column behave.
//
// buildFixtures({ profile, role })
//   profile: "populated" (default) | "empty" (auth, membership, entitlements
//            and platform reference rows only) | "fresh" (V4 Stage F: a new
//            org as the setup script leaves it, one owner, Pilot plan, no
//            data) | "halfdone" (fresh + identity confirmed, a teammate
//            invited and a donor import finished: 3 of 5 setup steps)
//   role:    membership role for the signed-in user (owner, admin, staff,
//            finance, board_viewer)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(here, "schema.json"), "utf8"));
const enums = JSON.parse(fs.readFileSync(path.join(here, "enums.json"), "utf8"));
const reference = JSON.parse(fs.readFileSync(path.join(here, "reference.json"), "utf8"));

// ── identities ──────────────────────────────────────────────────────────────
const ORG_ID = "a4a4a4a4-0000-4000-8000-000000000001";
const uid = (n) => `a4a4a4a4-0000-4000-8000-${String(n).padStart(12, "0")}`;

const TEAM = [
  { key: "dana", id: uid(101), displayName: "Dana Whitfield", email: "dana@demo-angels.example", role: "owner", title: "Executive Director" },
  { key: "marcus", id: uid(102), displayName: "Marcus Okafor", email: "marcus@demo-angels.example", role: "staff", title: "Director of Development" },
  { key: "priya", id: uid(103), displayName: "Priya Raman", email: "priya@demo-angels.example", role: "staff", title: "Program Manager" },
  { key: "lena", id: uid(104), displayName: "Lena Ortiz", email: "lena@demo-angels.example", role: "finance", title: "Finance & Operations Lead" },
  { key: "theo", id: uid(105), displayName: "Theo Brandt", email: "theo@demo-angels.example", role: "board_viewer", title: "Board Chair" },
];

export const DEMO = {
  org: { id: ORG_ID, name: "Ambition Angels (demo)", slug: "ambition-angels-demo" },
  user: TEAM[0],
  team: TEAM,
};

const ALL_FEATURES = [
  "modules.fundraising", "modules.finance", "modules.program", "modules.ops", "modules.board",
  "modules.compliance", "modules.strategy", "modules.staff", "modules.reviews", "modules.partners",
  "modules.meetings", "modules.comms", "modules.messages", "modules.documents", "modules.metrics",
  "modules.content", "ai.reed", "ai.prospect_research", "ai.capture", "coaching", "aa.demoday",
  "aa.ygb", "aa.mesa", "aa.quiz", "aa.bv", "aa.site_analytics", "aa.hubspot_mirror", "aa.app",
  "aa.internships", "aa.coach", "aa.finance_model",
];

// ── deterministic helpers ───────────────────────────────────────────────────
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTools(seed) {
  const r = prng(seed);
  let idc = 1000;
  const T = {
    r,
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    weighted: (pairs) => {
      const tot = pairs.reduce((s, [, w]) => s + w, 0);
      let x = r() * tot;
      for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
      return pairs[pairs.length - 1][0];
    },
    id: (ns) => {
      idc++;
      const hex = (ns * 1e6 + idc).toString(16).padStart(12, "0").slice(-12);
      return `a4a4a4a4-${String(ns).padStart(4, "0").slice(-4)}-4000-8000-${hex}`;
    },
  };
  return T;
}

const NOW = new Date();
const DAY = 86400000;
const iso = (d) => d.toISOString();
const ymd = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);
const daysFromNow = (n) => new Date(NOW.getTime() + n * DAY);
const startOfWeek = (() => {
  const d = new Date(NOW);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - dow * DAY);
})();
const at = (base, h, m = 0) => {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
};
const money = (x) => Math.round(x * 100) / 100;

// ── invented name pools ─────────────────────────────────────────────────────
const FIRST = ["Avery", "Jordan", "Camila", "Hector", "Naomi", "Rafael", "Ingrid", "Tobias", "Mei", "Darnell", "Sofia", "Elliot", "Farah", "Graham", "Hana", "Isaac", "Julia", "Kofi", "Lucia", "Mateo", "Nora", "Omar", "Paige", "Quinn", "Rosa", "Samir", "Tessa", "Uriel", "Vera", "Wes", "Ximena", "Yusuf", "Zara", "Bianca", "Caleb", "Delia", "Emeka", "Fiona", "Gideon", "Helena", "Ivan", "Jasmine", "Kai", "Leah", "Miles", "Nadia", "Owen", "Petra", "Ruben", "Simone", "Theodora", "Vikram", "Willa", "Anika", "Bruno", "Celeste", "Dmitri", "Esme", "Felix", "Greta"];
const LAST = ["Abernathy", "Bellweather", "Castellano", "Delacroix", "Eastwood", "Fairbanks", "Galloway", "Haverford", "Iwasaki", "Jablonski", "Kowalczyk", "Lindqvist", "Marchetti", "Nakamura", "Oyelaran", "Pemberton", "Quintero", "Rasmussen", "Sorensen", "Tanaka", "Underhill", "Valdivia", "Whitcombe", "Yarbrough", "Zielinski", "Ashdown", "Brightwater", "Calloway", "Dunmore", "Ellsworth", "Fennimore", "Greenleaf", "Holloway", "Ingersoll", "Kensington", "Larkspur", "Merriweather", "Northcott", "Okonkwo", "Prescott", "Redfield", "Stonebridge", "Thistlewood", "Vandermeer", "Wakefield"];
const STUDENT_FIRST = ["Aaliyah", "Brandon", "Citlali", "Dante", "Esperanza", "Fernando", "Giselle", "Hugo", "Itzel", "Jaylen", "Kiara", "Luis", "Marisol", "Nico", "Odalys", "Pedro", "Rocio", "Santiago", "Tatiana", "Valeria", "Xavier", "Yesenia", "Adrian", "Brianna", "Cesar", "Daniela", "Emilio", "Fatima", "Gabriel", "Imani", "Josue", "Karina", "Leonel", "Monique", "Noemi", "Oscar", "Paloma", "Ricardo", "Selena", "Tomas"];
const STUDENT_LAST = ["Alvarado", "Barrera", "Cardenas", "Dominguez", "Espinoza", "Fuentes", "Guzman", "Herrera", "Ibarra", "Juarez", "Lozano", "Mendoza", "Navarro", "Orozco", "Pacheco", "Quiroz", "Rosales", "Salazar", "Trujillo", "Vega", "Washington", "Jackson", "Nguyen", "Tran", "Patel", "Kim", "Okoye", "Mensah"];
const FOUNDATIONS = ["Harborview Community Foundation", "Crestline Family Fund", "Bayside Youth Futures Trust", "Larkfield Foundation", "Meridian Opportunity Fund", "Silver Pine Charitable Trust", "Cedar Hollow Foundation", "Brightpath Education Fund", "Orchard Valley Giving Circle", "Wren & Ashby Family Foundation", "Tidewater Workforce Initiative", "Summit Ridge Foundation"];
const COMPANIES = ["Northgate Robotics", "Bluefin Analytics", "Copperleaf Health", "Kestrel Logistics", "Lumen Grid Energy", "Parallax Software", "Granite Peak Bank", "Fable & Finch Design", "Ironwood Builders", "Sparrow Labs", "Helix Biotech", "Waypoint Mobility", "Driftwood Media", "Quartzline Semiconductors", "Evergreen Credit Union", "Atlas Field Services"];
const SCHOOLS = ["Eastlake High School", "Riverside Middle School", "Mission Ridge Academy", "Westbrook High School", "Del Sol Middle School", "Harbor Point Charter", "Valley Oak High School", "Sunnyslope Middle School", "Bayview Unified School District", "Southgate Prep", "Lincoln Park Community School", "Alder Creek High School"];
const NONPROFITS = ["Youth Forward Collective", "Boys & Girls Club of Demo County", "Bridgeway Mentors", "Pathfinder Library Teen Center", "Open Doors Workforce Network", "Next Step Coaching Alliance"];
const CITIES = [["San Mateo", "CA"], ["Redwood City", "CA"], ["East Palo Alto", "CA"], ["San Jose", "CA"], ["Oakland", "CA"], ["Menlo Park", "CA"], ["Fremont", "CA"], ["Hayward", "CA"], ["Daly City", "CA"]];
const STREETS = ["Oak St", "Maple Ave", "Cypress Ln", "Juniper Ct", "Harbor Blvd", "Sequoia Way", "Marina Dr", "Laurel St", "Willow Rd"];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

// ── generic completion from the schema ──────────────────────────────────────
function defaultFor(table, col) {
  const d = col.d;
  if (d != null) {
    if (/gen_random_uuid|uuid_generate/.test(d)) return "__uuid__";
    if (/now\(\)|CURRENT_TIMESTAMP/i.test(d)) return col.t === "date" ? ymd(NOW) : iso(NOW);
    if (/CURRENT_DATE/i.test(d)) return ymd(NOW);
    if (/^'\{\}'::(text|uuid)\[\]|ARRAY\[\]/.test(d)) return [];
    if (/^'(\{.*\}|\[.*\])'::jsonb?$/.test(d)) return JSON.parse(d.match(/^'(.*)'::/)[1]);
    if (/^'(.*)'::/.test(d)) {
      const v = d.match(/^'(.*)'::/)[1];
      if (col.t.startsWith("_")) return v === "{}" ? [] : v.replace(/[{}]/g, "").split(",");
      return v;
    }
    if (d === "true" || d === "false") return d === "true";
    if (/^-?\d+(\.\d+)?$/.test(d)) return Number(d);
    if (/^\(?(-?\d+(\.\d+)?)\)?(::\w+)?$/.test(d)) return Number(d.match(/-?\d+(\.\d+)?/)[0]);
    if (/nextval/.test(d)) return null;
  }
  if (col.null) return null;
  // NOT NULL without a default
  const en = enums[table]?.[col.n];
  if (en) return en[0];
  if (col.t.startsWith("_")) return [];
  switch (col.t) {
    case "uuid": return null;
    case "bool": return false;
    case "int2": case "int4": case "int8": case "numeric": case "float4": case "float8": return 0;
    case "jsonb": case "json": return {};
    case "timestamptz": case "timestamp": return iso(NOW);
    case "date": return ymd(NOW);
    default: return "";
  }
}
function complete(table, row, T) {
  const cols = schema[table];
  if (!cols) return row;
  const out = {};
  for (const c of cols) {
    if (c.n in row) out[c.n] = row[c.n];
    else {
      let v = defaultFor(table, c);
      if (v === "__uuid__") v = T.id(9);
      if (c.n === "org_id") v = ORG_ID;
      out[c.n] = v;
    }
  }
  // keep extra keys a fixture deliberately set (computed view columns etc.)
  for (const k of Object.keys(row)) if (!(k in out)) out[k] = row[k];
  return out;
}

// ── builder ─────────────────────────────────────────────────────────────────
export function buildFixtures({ profile = "populated", role = "owner", skipViews = false } = {}) {
  const T = makeTools(4242);
  const tables = {};
  const add = (table, rows) => {
    (tables[table] ||= []).push(...rows);
    return rows;
  };

  // Platform rows every profile gets.
  add("orgs", [{ id: ORG_ID, name: DEMO.org.name, slug: DEMO.org.slug, settings: { email_domain: "demo-angels.example" }, created_at: "2024-08-01T17:00:00Z", updated_at: iso(daysAgo(3)) }]);
  const team = TEAM.map((p, i) => ({ ...p, role: i === 0 ? role : p.role }));
  add("memberships", team.map((p, i) => ({ user_id: p.id, org_id: ORG_ID, role: p.role, created_at: `2024-08-0${i + 1}T17:00:00Z` })));
  add("profiles", team.map((p) => ({ user_id: p.id, display_name: p.displayName, created_at: "2024-08-01T17:00:00Z", updated_at: iso(daysAgo(10)), v2_shell: true })));
  add("org_entitlements", ALL_FEATURES.map((k) => ({ org_id: ORG_ID, feature_key: k, enabled: true, source: "seed", updated_at: "2026-01-02T00:00:00Z" })));
  add("role_permissions", reference.role_permissions || []);
  // V4 Stage D: the story bank's two keys (comms_phase1_story_schema), until
  // reference.json is regenerated from the migrations.
  // Voice for every role: capture.use for all five (capture_use_permission).
  for (const [role, permission] of [["owner", "comms.manage"], ["admin", "comms.manage"], ["staff", "comms.manage"], ["owner", "comms.subjects.read"], ["admin", "comms.subjects.read"], ...["owner", "admin", "staff", "finance", "board_viewer"].map((r) => [r, "capture.use"])]) {
    if (!tables.role_permissions.some((r) => r.role === role && r.permission === permission)) add("role_permissions", [{ role, permission }]);
  }
  add("entity_types", reference.entity_types || []);
  add("org_terminology", []); // AA keeps zero rows by design (lib/admin/terminology.ts)

  const rpcs = {
    has_permission: (args, fx, cfg) => {
      const perm = args.perm || args.permission || args.p_perm;
      return (fx.tables.role_permissions || []).some((r) => r.role === cfg.role && r.permission === perm);
    },
    can_view_staff: (args, fx, cfg) => cfg.role === "owner" || cfg.role === "admin",
    bloomos_search_people: (args, fx) => {
      const q = String(args.q || args.query || args.p_query || "").toLowerCase();
      if (!q) return [];
      return (fx.tables.constituents || [])
        .filter((c) => `${c.first_name || ""} ${c.last_name || ""} ${c.org_name || ""}`.toLowerCase().includes(q))
        .slice(0, 10)
        .map((c) => ({ id: c.id, kind: "constituent", label: c.org_name || `${c.first_name} ${c.last_name}`, sublabel: c.type, name: c.org_name || `${c.first_name} ${c.last_name}`, type: c.type }));
    },
    hubspot_bench_candidates_count: 0,
    hubspot_bench_candidates: [],
  };

  if (profile === "fresh" || profile === "halfdone") freshOrg(T, tables, profile);
  else if (profile !== "empty") populate(T, add, tables, team);

  // SQL views computed over these fixtures by compute-views.mjs (real view
  // definitions, run in a throwaway Postgres). Absent file = views stay empty.
  const viewsFile = path.join(here, "views.json");
  if (profile === "populated" && !skipViews && fs.existsSync(viewsFile)) {
    const views = JSON.parse(fs.readFileSync(viewsFile, "utf8"));
    for (const [v, rows] of Object.entries(views)) if (Array.isArray(rows)) tables[v] = rows.filter((r) => !("org_id" in r) || r.org_id === ORG_ID);
  }

  // complete every row against the schema
  for (const t of Object.keys(tables)) if (!t.startsWith("v_") && t !== "ms_catalog") tables[t] = tables[t].map((r) => complete(t, r, T));
  return { tables, rpcs };
}

// V4 Stage F: a brand-new org as scripts/setup-org.ts leaves it (invented
// "Harbor Youth Collective"), and the same org part way through setup.
const PILOT = ["modules.fundraising", "modules.finance", "modules.comms", "modules.ops", "modules.meetings", "modules.messages", "modules.documents", "ai.capture", "modules.strategy", "modules.board", "modules.compliance", "modules.staff", "modules.metrics"];
function freshOrg(T, tables, profile) {
  const owner = tables.memberships[0];
  tables.orgs = [{ id: ORG_ID, name: "Harbor Youth Collective", slug: "harbor-youth", settings: { email_domain: "harboryouth.example.org", timezone: "America/New_York" }, created_at: iso(daysAgo(1)), updated_at: iso(daysAgo(1)) }];
  tables.memberships = [owner];
  tables.profiles = tables.profiles.filter((p) => p.user_id === owner.user_id).map((p) => ({ ...p, display_name: "Maya Lindqvist" }));
  tables.org_entitlements = PILOT.map((k) => ({ org_id: ORG_ID, feature_key: k, enabled: true, source: "setup-org", updated_at: iso(daysAgo(1)) }));
  tables.org_terminology = [{ org_id: ORG_ID, term_key: "student", label: "Youth", updated_at: iso(daysAgo(1)) }];
  tables.fin_config = [{ org_id: ORG_ID, fiscal_year_start_month: 7 }];
  tables.pipelines = [{ id: T.id(70), org_id: ORG_ID, key: "default", label: "Donor pipeline", sort_order: 0, is_default: true }];
  if (profile !== "halfdone") return;
  tables.orgs[0].settings = {
    ...tables.orgs[0].settings,
    legal_name: "Harbor Youth Collective, Inc.",
    ein: "12-3456789",
    address: { street: "88 Wharf Street", city: "Portland", state: "ME", postal_code: "04101" },
    mailing_address: "88 Wharf Street, Portland, ME 04101",
  };
  tables.memberships.push({ user_id: uid(106), org_id: ORG_ID, role: "staff", created_at: iso(daysAgo(0)) });
  tables.profiles.push({ user_id: uid(106), display_name: "Jordan Ellis", created_at: iso(daysAgo(0)), updated_at: iso(daysAgo(0)), v2_shell: true });
  const run = T.id(71);
  tables.imports = [{ id: run, org_id: ORG_ID, entity_type: "gift", source: "csv", filename: "donors-2025.csv", status: "done", mapping: {}, counts: { total: 14, created: 12, skipped: 2, invalid: 0, donors_created: 9 }, created_at: iso(daysAgo(0)), finished_at: iso(daysAgo(0)) }];
  tables.constituents = ["Dana Whitfield", "Priya Raman", "Marcus Oyelaran", "Elena Brandt", "Okafor Family", "Harlow Family Fund", "Northgate Credit Union", "Tidewater Community Trust", "Jon Castellano"].map((n, i) => {
    const org = /Fund|Union|Trust|Family$/.test(n);
    const [first, ...rest] = n.split(" ");
    return { id: T.id(72), org_id: ORG_ID, type: org ? "organization" : "person", ...(org ? { org_name: n } : { first_name: first, last_name: rest.join(" ") }), emails: [`donor${i + 1}@example.org`], source: "import", import_id: run, created_at: iso(daysAgo(0)), updated_at: iso(daysAgo(0)) };
  });
}

function populate(T, add, tables, team) {
  const H = team.map((p) => p.key); // handles
  const staffHandles = ["dana", "marcus", "priya", "lena"];
  const now = NOW;

  // staff
  const staffRows = add("staff", team.filter((p) => p.role !== "board_viewer").map((p, i) => ({ id: T.id(1), org_id: ORG_ID, user_id: p.id, full_name: p.displayName, title: p.title, department: ["Leadership", "Development", "Programs", "Operations"][i], employment_type: "staff", start_date: ["2024-08-01", "2025-01-13", "2025-03-03", "2025-06-16"][i], reports_to: null, status: "active", sort_order: i })));
  for (const s of staffRows.slice(1)) s.reports_to = staffRows[0].id;

  // reference rows remapped to the demo org
  const remap = (rows) => (rows || []).filter((r) => !/leak/i.test(JSON.stringify(r))).map((r) => ({ ...r, org_id: ORG_ID }));
  add("fin_categories", remap(reference.fin_categories));
  add("pipelines", remap(reference.pipelines));
  add("pipeline_stages", remap(reference.pipeline_stages));
  const metricDefs = add("metric_definitions", remap(reference.metric_definitions).map((m) => ({ ...m, owner_id: team[2].id, target: m.unit === "pct" ? 80 : m.unit === "usd" ? 450 : m.metric_key === "reached_all_time" ? 4000 : 300 })));
  add("participant_stages", remap(reference.participant_stages));

  add("org_settings", [{ org_id: ORG_ID }]);
  add("org_comms_settings", [{ org_id: ORG_ID, from_name: "Ambition Angels (demo)", from_email: "hello@demo-angels.example", reply_to: "dana@demo-angels.example", mailing_address: "100 Example Way, Demo City, CA 94000", footer_text: "Ambition Angels (demo) is a made-up 501(c)(3) for screenshots.", daily_send_cap: 2000, transport: "gmail" }]);

  // ── constituents ──────────────────────────────────────────────────────────
  const people = [];
  for (let i = 0; i < 110; i++) {
    const fn = FIRST[(i * 7) % FIRST.length];
    const ln = LAST[(i * 11 + 3) % LAST.length];
    const [city, state] = T.pick(CITIES);
    people.push({
      id: T.id(2), org_id: ORG_ID, type: "person", first_name: fn, last_name: ln, org_name: null,
      emails: [`${slug(fn)}.${slug(ln)}@example.com`], phones: T.chance(0.6) ? [`(650) 555-${String(1000 + i).slice(-4)}`] : [],
      street: `${T.int(100, 4999)} ${T.pick(STREETS)}`, city, state, postal_code: String(94000 + T.int(1, 600)),
      tags: T.chance(0.3) ? [T.pick(["board-prospect", "monthly-donor", "event-2025", "volunteer", "parent", "alumni-parent"])] : [],
      do_not_contact: T.chance(0.03), source: T.pick(["manual", "import", "hubspot", "stripe"]),
      external_ids: {}, notes: T.chance(0.2) ? "Met at the spring showcase; interested in career mentoring." : null,
      created_at: iso(daysAgo(T.int(20, 700))), updated_at: iso(daysAgo(T.int(0, 60))),
      is_volunteer: T.chance(0.18), preferred_ack_channel: T.pick(["email", "email", "letter", "call"]),
      why_matters: T.chance(0.25) ? "Former first-gen college student; wants teens to see real career paths." : null,
      custom_fields: {}, domains: [],
    });
  }
  const orgsC = [];
  FOUNDATIONS.forEach((n) => orgsC.push({ name: n, kind: "foundation" }));
  COMPANIES.forEach((n) => orgsC.push({ name: n, kind: "company" }));
  NONPROFITS.forEach((n) => orgsC.push({ name: n, kind: "nonprofit" }));
  SCHOOLS.slice(0, 6).forEach((n) => orgsC.push({ name: n, kind: "school" }));
  const orgRows = orgsC.map((o, i) => {
    const [city, state] = T.pick(CITIES);
    return {
      id: T.id(2), org_id: ORG_ID, type: "organization", first_name: null, last_name: null, org_name: o.name,
      emails: [`grants@${slug(o.name).replace(/\./g, "")}.example.org`], phones: [], city, state,
      tags: [o.kind], do_not_contact: false, source: "manual", external_ids: {},
      created_at: iso(daysAgo(T.int(60, 700))), updated_at: iso(daysAgo(T.int(0, 90))),
      is_volunteer: false, custom_fields: {}, domains: [`${slug(o.name).replace(/\./g, "")}.example.org`],
      company_stage: o.kind === "company" ? T.pick(enums.constituents.company_stage) : null,
      notes: o.kind === "foundation" ? "Funds youth workforce programs in the region. Cycle opens each spring." : null,
      _kind: o.kind,
    };
  });
  const constituents = add("constituents", [...people, ...orgRows]);
  // V4 B2 assignment: a third owned by the signed-in owner (team[0]), a third
  // by the development director, the rest unassigned.
  constituents.forEach((c, i) => { c.owner_id = i % 3 === 0 ? team[0].id : i % 3 === 1 ? team[1].id : null; });
  const foundations = orgRows.filter((o) => o._kind === "foundation");
  const companies = orgRows.filter((o) => o._kind === "company");
  orgRows.forEach((o) => delete o._kind);

  // households
  const households = add("households", Array.from({ length: 8 }, (_, i) => ({ id: T.id(3), org_id: ORG_ID, name: `The ${people[i * 2].last_name} Household`, created_at: iso(daysAgo(200)) })));
  households.forEach((h, i) => { people[i * 2].household_id = h.id; people[i * 2 + 1].household_id = h.id; });

  // funds, appeals, campaigns
  const funds = add("funds", [
    { id: T.id(4), org_id: ORG_ID, name: "General Operating", restricted: false },
    { id: T.id(4), org_id: ORG_ID, name: "Career Labs (restricted)", restricted: true },
    { id: T.id(4), org_id: ORG_ID, name: "Summer Internships", restricted: true },
  ]);
  const campaigns = add("campaigns", [
    { id: T.id(4), org_id: ORG_ID, name: "Year-End Appeal 2026", goal: 150000, starts_on: ymd(daysAgo(30)), ends_on: ymd(daysFromNow(45)) },
    { id: T.id(4), org_id: ORG_ID, name: "Spring Showcase 2026", goal: 60000, starts_on: ymd(daysAgo(230)), ends_on: ymd(daysAgo(190)) },
    { id: T.id(4), org_id: ORG_ID, name: "Corporate Partners Drive", goal: 200000, starts_on: ymd(daysAgo(120)), ends_on: ymd(daysFromNow(120)) },
    { id: T.id(4), org_id: ORG_ID, name: "Year-End Appeal 2025", goal: 120000, starts_on: ymd(daysAgo(395)), ends_on: ymd(daysAgo(320)) },
    { id: T.id(4), org_id: ORG_ID, name: "Monthly Angels", goal: 36000, starts_on: ymd(daysAgo(300)), ends_on: null },
  ]);
  const appeals = add("appeals", campaigns.slice(0, 3).map((c) => ({ id: T.id(4), org_id: ORG_ID, campaign_id: c.id, name: `${c.name} email` })));

  // recurring plans
  const recurring = add("recurring_plans", people.slice(10, 32).map((p, i) => ({
    id: T.id(5), org_id: ORG_ID, constituent_id: p.id, amount: T.pick([25, 50, 50, 100, 150, 250]), frequency: i % 6 === 0 ? "annually" : "monthly",
    status: i % 9 === 0 ? "paused" : i % 13 === 0 ? "cancelled" : "active", external_source: "stripe", external_id: `sub_demo${i}`,
    created_at: iso(daysAgo(T.int(90, 600))), last_charged_at: iso(daysAgo(T.int(1, 28))), last_payment_failed_at: i === 4 ? iso(daysAgo(3)) : null,
  })));

  // gifts: 400 over ~20 months
  const gifts = [];
  for (let i = 0; i < 400; i++) {
    const isOrg = T.chance(0.12);
    const donor = isOrg ? T.pick([...foundations, ...companies]) : people[Math.floor(Math.pow(T.r(), 1.6) * people.length)];
    const amount = isOrg ? T.pick([5000, 10000, 15000, 25000, 50000, 2500]) : T.weighted([[25, 3], [50, 5], [100, 6], [250, 4], [500, 3], [1000, 2], [2500, 1], [5000, 0.4], [10000, 0.15]]);
    const age = Math.floor(Math.pow(T.r(), 1.3) * 600);
    const d = daysAgo(age);
    const camp = age < 30 ? campaigns[0] : age < 230 && age > 185 ? campaigns[1] : age > 320 && age < 395 ? campaigns[3] : T.chance(0.2) ? campaigns[2] : null;
    gifts.push({
      id: T.id(6), org_id: ORG_ID, constituent_id: donor.id, amount, gift_date: ymd(d),
      method: isOrg ? T.pick(["check", "ach"]) : T.weighted([["card", 6], ["check", 2], ["ach", 1], ["stock", 0.2], ["in_kind", 0.2]]),
      deductible_amount: amount, campaign_id: camp?.id ?? null, fund_id: T.chance(0.15) ? funds[1].id : funds[0].id,
      appeal_id: null, recurring_plan_id: null, external_source: T.pick([null, "stripe", "hubspot"]),
      acknowledgment_status: age < 6 ? "pending" : age < 12 && T.chance(0.5) ? "pending" : "sent",
      acknowledged_at: age >= 6 ? iso(daysAgo(Math.max(0, age - 3))) : null, notes: null,
      created_at: iso(d), updated_at: iso(d),
    });
  }
  // recurring charges
  for (const rp of recurring.filter((x) => x.status === "active" && x.frequency === "monthly").slice(0, 10)) {
    for (let m = 0; m < 6; m++) {
      const d = daysAgo(m * 30 + 3);
      gifts.push({ id: T.id(6), org_id: ORG_ID, constituent_id: rp.constituent_id, amount: rp.amount, gift_date: ymd(d), method: "card", deductible_amount: rp.amount, campaign_id: campaigns[4].id, fund_id: funds[0].id, recurring_plan_id: rp.id, external_source: "stripe", acknowledgment_status: "not_required", created_at: iso(d), updated_at: iso(d) });
    }
  }
  add("gifts", gifts);

  // soft credits
  add("soft_credits", gifts.filter((g, i) => i % 40 === 0).map((g, i) => ({ id: T.id(6), org_id: ORG_ID, gift_id: g.id, constituent_id: people[(i * 3 + 50) % people.length].id, amount: g.amount, created_at: g.created_at })));

  // pledges + payments
  const pledges = add("pledges", Array.from({ length: 24 }, (_, i) => {
    const donor = i < 8 ? [...foundations, ...companies][i] : people[60 + i];
    const total = i < 8 ? T.pick([30000, 50000, 75000, 100000]) : T.pick([2400, 5000, 6000, 12000]);
    return { id: T.id(7), org_id: ORG_ID, constituent_id: donor.id, total_amount: total, installment_count: i < 8 ? 3 : 12, frequency: i < 8 ? "annually" : "monthly", start_date: ymd(daysAgo(T.int(30, 400))), campaign_id: i % 3 === 0 ? campaigns[2].id : null, fund_id: funds[0].id, status: i === 5 ? "completed" : i === 17 ? "cancelled" : "active", notes: i < 8 ? "Multi-year commitment; payments due each fiscal year." : null, created_at: iso(daysAgo(T.int(30, 400))) };
  }));
  add("pledge_payments", pledges.flatMap((p) => Array.from({ length: p.installment_count }, (_, k) => ({ id: T.id(7), org_id: ORG_ID, pledge_id: p.id, due_date: ymd(new Date(new Date(p.start_date).getTime() + k * (p.frequency === "monthly" ? 30 : 365) * DAY)), expected_amount: money(p.total_amount / p.installment_count), status: new Date(p.start_date).getTime() + k * (p.frequency === "monthly" ? 30 : 365) * DAY < now.getTime() ? "paid" : "scheduled", created_at: iso(daysAgo(100)) }))));

  // grants
  const grantStages = ["prospect", "qualified", "loi", "proposal", "submitted", "awarded", "declined", "active", "closed"];
  const grants = add("grants", Array.from({ length: 18 }, (_, i) => {
    const f = foundations[i % foundations.length];
    const stage = grantStages[i % grantStages.length];
    const req = T.pick([25000, 40000, 50000, 75000, 100000, 150000]);
    return {
      id: T.id(8), org_id: ORG_ID, funder_id: f.id, name: `${f.org_name.split(" ")[0]} ${T.pick(["Career Labs", "Summer Internships", "General Operating", "Teen Pathways", "Mentor Network"])} ${2026 + (i % 2)}`,
      stage, amount_requested: req, amount_awarded: ["awarded", "active", "closed"].includes(stage) ? req * T.pick([0.6, 0.8, 1]) : null,
      restrictions: i % 3 === 0 ? "Restricted to programming for grades 8 to 12." : null, fund_id: funds[i % 3].id,
      period_start: ymd(daysAgo(T.int(-60, 300))), period_end: ymd(daysFromNow(T.int(30, 400))), program: T.pick(["Career Labs", "Internships", "General"]),
      owner: T.pick(["marcus", "dana"]), notes: "Program officer prefers a short call before submission.", created_at: iso(daysAgo(T.int(30, 400))), updated_at: iso(daysAgo(T.int(0, 30))),
    };
  }));
  add("grant_requirements", grants.filter((g) => ["awarded", "active"].includes(g.stage)).flatMap((g, i) => [
    { id: T.id(8), org_id: ORG_ID, grant_id: g.id, kind: "interim_report", label: "Interim narrative report", due_date: ymd(daysFromNow(10 + i * 9)), status: "upcoming", created_at: iso(daysAgo(60)) },
    { id: T.id(8), org_id: ORG_ID, grant_id: g.id, kind: "financial_report", label: "Final financial report", due_date: ymd(daysFromNow(120 + i * 9)), status: "upcoming", created_at: iso(daysAgo(60)) },
  ]));
  add("grant_contacts", grants.slice(0, 8).map((g, i) => ({ id: T.id(8), org_id: ORG_ID, grant_id: g.id, constituent_id: people[90 + i].id, role: "program_officer", created_at: iso(daysAgo(90)) })));

  // opportunities (major gift pipeline)
  const oppStages = ["identified", "researched", "needs_appointment", "appointment_scheduled", "meeting_complete", "ask_made", "pledged", "closed_won", "closed_lost", "on_hold"];
  const opps = add("opportunities", Array.from({ length: 36 }, (_, i) => {
    const donor = i < 10 ? [...companies, ...foundations][i] : people[i * 3 % people.length];
    const stage = oppStages[Math.min(oppStages.length - 1, Math.floor(Math.pow(T.r(), 0.9) * oppStages.length))];
    return {
      id: T.id(10), org_id: ORG_ID, constituent_id: donor.id, name: `${donor.org_name || donor.first_name + " " + donor.last_name} ${T.pick(["leadership gift", "renewal", "Career Labs sponsor", "internship host + gift", "year-end gift"])}`,
      stage, pipeline: "default", ask_amount: T.pick([5000, 10000, 25000, 50000, 100000]), expected_close: ymd(daysFromNow(T.int(-20, 150))),
      probability: T.int(10, 90), capacity_rating: T.int(1, 5), affinity_rating: T.int(1, 5), owner: T.pick(["marcus", "dana"]),
      next_step: T.pick(["Send impact one-pager", "Schedule site visit", "Draft proposal", "Follow up on ask", "Invite to showcase"]),
      next_step_due: ymd(daysFromNow(T.int(-7, 21))), external_ids: {}, created_at: iso(daysAgo(T.int(10, 300))), updated_at: iso(daysAgo(T.int(0, 40))),
      // add_owner_id_opportunities.sql: a third owned by id (you, or a
      // teammate), the rest still on the free-text owner.
      owner_id: i % 3 === 0 ? team[0].id : i % 3 === 1 ? team[1].id : null,
    };
  }));

  // asks
  add("asks", Array.from({ length: 26 }, (_, i) => {
    const f = i < 14 ? foundations[i % foundations.length] : companies[i % companies.length];
    const status = T.pick(enums.asks.status);
    const amt = T.pick([10000, 25000, 50000, 75000]);
    return { id: T.id(11), org_id: ORG_ID, funder_id: f.id, form: i < 14 ? T.pick(["grant_proposal", "loi"]) : T.pick(["corporate_sponsorship", "major_gift", "event_sponsorship"]), title: `${f.org_name.split(" ")[0]} ${T.pick(["2027 renewal", "Career Labs expansion", "Summer cohort", "Operating support"])}`, amount_requested: amt, ask_date: ymd(daysAgo(T.int(0, 200))), status, amount_committed: ["awarded", "partial"].includes(status) ? amt * (status === "partial" ? 0.5 : 1) : null, decided_on: ["awarded", "partial", "declined"].includes(status) ? ymd(daysAgo(T.int(0, 60))) : null, owner: T.pick(["marcus", "dana"]), owner_id: i % 4 === 0 ? null : i % 4 === 1 ? team[1].id : team[0].id, grant_id: i < 14 ? grants[i % grants.length].id : null, opportunity_id: i >= 14 ? opps[i % 10].id : null, created_by: "marcus", created_at: iso(daysAgo(T.int(0, 200))) };
  }));

  // prospects
  add("fr_prospects", Array.from({ length: 16 }, (_, i) => ({ id: T.id(12), org_id: ORG_ID, type: T.pick(["individual", "foundation", "corporate"]), source: T.pick(["manual", "research"]), name: i % 2 ? `${FIRST[(i * 5 + 13) % FIRST.length]} ${LAST[(i * 3 + 7) % LAST.length]}` : `${T.pick(["Riverbend", "Halcyon", "Granger", "Morrow", "Ashgrove"])} ${T.pick(["Foundation", "Partners", "Trust", "Group"])}`, email: null, org_name: null, status: i === 3 ? "disqualified" : i === 6 ? "promoted" : "active", strategy_note: "Board member intro possible via a mutual connection.", created_by: "marcus", created_at: iso(daysAgo(T.int(2, 120))) })));

  // interactions
  add("interactions", Array.from({ length: 220 }, (_, i) => {
    const c = T.chance(0.7) ? people[Math.floor(Math.pow(T.r(), 1.5) * people.length)] : T.pick(orgRows);
    const kind = T.pick(enums.interactions.kind);
    const d = daysAgo(Math.floor(Math.pow(T.r(), 1.4) * 400));
    return { id: T.id(13), org_id: ORG_ID, constituent_id: c.id, kind, occurred_at: iso(d), notes: T.pick(["Thanked for gift; asked about internship hosting.", "Coffee check-in. Interested in joining the spring panel.", "Left voicemail.", "Shared the fall impact update.", "Discussed a matching gift from their employer."]), logged_by: T.pick(staffHandles), direction: kind === "email" ? T.pick(["inbound", "outbound"]) : null, subject: kind === "email" ? T.pick(["Quick thank you", "Spring showcase invite", "Following up", "Impact update"]) : null, is_private: false, shannon_present: false, created_at: iso(d) };
  }));

  // acknowledgments + templates + stewardship
  add("ack_templates", [
    { id: T.id(14), org_id: ORG_ID, name: "Default gift thank-you", channel: "email", subject: "Thank you for your gift to Ambition Angels (demo)", body: "Dear {{first_name}},\n\nThank you for your gift of {{amount}}. Teens in our Career Labs met three new mentors this month because of people like you.\n\nWith gratitude,\nDana", is_default: true },
    { id: T.id(14), org_id: ORG_ID, name: "First-gift welcome call script", channel: "call", subject: null, body: "Thank them, share one student story, ask what drew them in." },
    { id: T.id(14), org_id: ORG_ID, name: "Major-gift letter", channel: "letter", subject: null, body: "Dear {{first_name}}, ..." },
  ]);
  add("acknowledgments", gifts.filter((g) => g.acknowledgment_status === "sent").slice(0, 80).map((g) => ({ id: T.id(14), org_id: ORG_ID, gift_id: g.id, subject_type: "gift", subject_id: g.id, template: "Default gift thank-you", channel: "email", subject: "Thank you", sent_by: "marcus", sent_at: g.acknowledged_at, created_at: g.acknowledged_at })));

  // journeys
  const journeys = add("journeys", [
    { id: T.id(15), org_id: ORG_ID, name: "First-gift welcome", trigger: "first_gift", status: "active" },
    { id: T.id(15), org_id: ORG_ID, name: "Lapsed donor win-back", trigger: "lapsed", status: "paused" },
  ]);

  // segments + email campaigns + sends
  const segments = add("segments", [
    { id: T.id(16), org_id: ORG_ID, name: "All active donors", definition: { rules: [{ field: "gave_within_days", op: "lte", value: 365 }] }, created_by: "marcus" },
    { id: T.id(16), org_id: ORG_ID, name: "Monthly Angels", definition: { rules: [{ field: "recurring", op: "eq", value: true }] }, created_by: "marcus" },
    { id: T.id(16), org_id: ORG_ID, name: "Lapsed 13 to 24 months", definition: { rules: [{ field: "last_gift_days", op: "between", value: [395, 730] }] }, created_by: "dana" },
    { id: T.id(16), org_id: ORG_ID, name: "Volunteers", definition: { rules: [{ field: "is_volunteer", op: "eq", value: true }] }, created_by: "priya" },
  ]);
  const ecs = add("email_campaigns", [
    { name: "November impact update", subject: "Three teens, three first internships", status: "sent", seg: 0, ago: 6, n: 92 },
    { name: "Giving Tuesday reminder", subject: "Tomorrow is Giving Tuesday", status: "scheduled", seg: 0, ago: -8, n: 0 },
    { name: "Year-end appeal (draft)", subject: "Your gift, doubled until Dec 31", status: "draft", seg: 0, ago: 0, n: 0 },
    { name: "Monthly Angels thank-you", subject: "A note from the Career Lab", status: "sent", seg: 1, ago: 21, n: 22 },
    { name: "Volunteer mentor call", subject: "Mentors needed for spring Career Labs", status: "sent", seg: 3, ago: 34, n: 20 },
    { name: "Win-back test", subject: "We miss you", status: "canceled", seg: 2, ago: 50, n: 0 },
    { name: "October newsletter", subject: "October at Ambition Angels (demo)", status: "sent", seg: 0, ago: 40, n: 88 },
  ].map((c) => ({ id: T.id(17), org_id: ORG_ID, name: c.name, subject: c.subject, body: `<p>Hi {{first_name}},</p><p>${c.subject}. Here is what your support made possible this month.</p><p>Dana</p>`, segment_id: segments[c.seg].id, status: c.status, recipient_count: c.n, sent_count: c.status === "sent" ? c.n - 2 : 0, failed_count: c.status === "sent" ? 2 : 0, sent_at: c.status === "sent" ? iso(daysAgo(c.ago)) : null, scheduled_at: c.status === "scheduled" ? iso(daysFromNow(-c.ago)) : null, started_at: c.status === "sent" ? iso(daysAgo(c.ago)) : null, finished_at: c.status === "sent" ? iso(daysAgo(c.ago)) : null, created_by: "marcus", created_at: iso(daysAgo(Math.max(c.ago, 0) + 3)), updated_at: iso(daysAgo(Math.max(c.ago, 0))), left_out: {}, unknown_count: 0 })));
  const sends = [];
  for (const c of ecs.filter((x) => x.status === "sent")) {
    for (let k = 0; k < c.recipient_count; k++) {
      const p = people[k % people.length];
      const failed = k >= c.recipient_count - 2;
      const opened = !failed && T.chance(0.48);
      sends.push({ id: T.id(18), org_id: ORG_ID, campaign_id: c.id, constituent_id: p.id, email: p.emails[0], first_name: p.first_name, status: failed ? "failed" : "sent", error: failed ? "550 mailbox unavailable" : null, sent_at: c.sent_at, created_at: c.created_at, attempt_count: 1, open_count: opened ? T.int(1, 3) : 0, first_opened_at: opened ? c.sent_at : null, click_count: opened && T.chance(0.3) ? 1 : 0, tracking_token: `tok${k}${c.id.slice(-4)}` });
    }
  }
  add("email_sends", sends);
  add("email_suppressions", [{ id: T.id(18), org_id: ORG_ID, email: "bounced.address@example.com", reason: "hard_bounce", created_at: iso(daysAgo(40)) }]);

  // ── V4 Stage D: story bank, consents, formats and editions ──────────────
  // Invented people; first name and last initial only, as the bank stores.
  const validSegs = add("segments", [
    { id: T.id(16), org_id: ORG_ID, name: "Gave in 2025, not yet in 2026", definition: { view: "lapsed" }, created_by: "dana" },
    { id: T.id(16), org_id: ORG_ID, name: "Donors of $250 or more", definition: { view: "donors", min_total: "250" }, created_by: "marcus" },
  ]);
  const st = (n, o) => ({ id: T.id(19), org_id: ORG_ID, tags: [], rank_order: null, strategic_goal_id: null, source: "manual", happened_on: ymd(daysAgo(n)), created_at: iso(daysAgo(n)), updated_at: iso(daysAgo(n)), outcome: null, ...o });
  const stories = add("stories", [
    st(4, { title: "Asked back for a summer job", body: "Jaylen practiced interviews with two Northgate staff. They asked him back for a summer job.", outcome: "He has a paid summer role lined up.", status: "approved", captured_by: "priya" }),
    st(2, { title: "A question about pay, answered", body: "Sofia P. asked her coach how a paycheck works, and the group built a first budget together.", status: "approved", captured_by: "priya" }),
    st(6, { title: "Showcase night, a full room", body: "Forty families came to the spring showcase and every table had a teen presenting.", outcome: "Twelve families signed up to host a site visit.", status: "approved", captured_by: "dana" }),
    st(9, { title: "First robotics meet", body: "Ana R. led her team's first robotics meet and wrote the practice plan herself.", status: "approved", captured_by: "marcus" }),
    st(1, { title: "Mentor match that clicked", body: "A volunteer engineer and Leo T. found they grew up two streets apart.", status: "raw", captured_by: "priya", source: "reed" }),
  ]);
  const [sJob, sPay, sShow, sRobot, sMentor] = stories;
  const subj = add("story_subjects", [
    { id: T.id(19), org_id: ORG_ID, story_id: sJob.id, subject_type: "participant", subject_id: null, display_label: "Jaylen M.", is_minor: true, created_at: sJob.created_at },
    { id: T.id(19), org_id: ORG_ID, story_id: sPay.id, subject_type: "participant", subject_id: null, display_label: "Sofia P.", is_minor: true, created_at: sPay.created_at },
    { id: T.id(19), org_id: ORG_ID, story_id: sShow.id, subject_type: "none", subject_id: null, display_label: "No one identifiable", is_minor: false, created_at: sShow.created_at },
    { id: T.id(19), org_id: ORG_ID, story_id: sRobot.id, subject_type: "participant", subject_id: null, display_label: "Ana R.", is_minor: true, created_at: sRobot.created_at },
    { id: T.id(19), org_id: ORG_ID, story_id: sMentor.id, subject_type: "participant", subject_id: null, display_label: "Leo T.", is_minor: true, created_at: sMentor.created_at },
  ]);
  add("story_consents", [
    { id: T.id(19), org_id: ORG_ID, story_subject_id: subj[0].id, scope: ["first_name", "quote", "outcome_details"], requested_at: ymd(daysAgo(5)), granted_by: "Parent on file (example)", granted_at: ymd(daysAgo(3)), expires_at: ymd(daysFromNow(365)), revoked_at: null, evidence_document_id: null, notes: null, created_at: iso(daysAgo(3)) },
    { id: T.id(19), org_id: ORG_ID, story_subject_id: subj[3].id, scope: ["first_name"], requested_at: ymd(daysAgo(2)), granted_by: null, granted_at: null, expires_at: null, revoked_at: null, evidence_document_id: null, notes: "Asked at pickup.", created_at: iso(daysAgo(2)) },
  ]);
  const quarterly = { id: T.id(19), org_id: ORG_ID, name: "Quarterly newsletter", cadence: "quarterly", is_archived: false, created_at: iso(daysAgo(30)), updated_at: iso(daysAgo(30)), slots: [
    { key: "letter", label: "Letter from the leader", kind: "letter", required: true, hint: "One piece of your model, personal, signed." },
    { key: "person", label: "Person spotlight", kind: "story", required: true, hint: "A named person doing something. Needs current consent." },
    { key: "work", label: "The work", kind: "story", required: true, hint: "Something that happened since last time. Outcome, not output." },
    { key: "ask", label: "Support the work", kind: "ask", required: true, hint: "Always present, never a hard ask." },
  ] };
  add("comms_formats", [quarterly, { id: T.id(19), org_id: ORG_ID, name: "News flash", cadence: "adhoc", is_archived: false, created_at: iso(daysAgo(30)), updated_at: iso(daysAgo(30)), slots: [{ key: "flash", label: "What happened", kind: "story", required: true }, { key: "ask", label: "Support the work", kind: "ask", required: false }] }]);
  const yearEnd = ecs.find((c) => c.status === "draft");
  const editions = add("comms_editions", [
    { id: T.id(19), org_id: ORG_ID, format_id: quarterly.id, title: "Winter 2026 newsletter", subject: "What your gift did this fall", status: "drafting", target_date: ymd(daysFromNow(10)), email_campaign_id: null, sent_at: null, created_at: iso(daysAgo(8)), updated_at: iso(daysAgo(1)) },
    { id: T.id(19), org_id: ORG_ID, format_id: quarterly.id, title: "Year-end appeal", subject: "Your gift, doubled until Dec 31", status: "compiled", target_date: ymd(daysFromNow(30)), email_campaign_id: yearEnd ? yearEnd.id : null, sent_at: null, created_at: iso(daysAgo(12)), updated_at: iso(daysAgo(2)) },
  ]);
  const slot = (ed, s, i, o = {}) => ({ id: T.id(19), org_id: ORG_ID, edition_id: ed.id, slot_key: s.key, slot_def: s, story_id: null, metric_ids: null, content: null, position: i, created_at: ed.created_at, updated_at: ed.updated_at, ...o });
  add("comms_edition_slots", [
    slot(editions[0], quarterly.slots[0], 0, { content: "This fall our teens walked into workplaces for the first time. Here is one of them." }),
    slot(editions[0], quarterly.slots[1], 1, { story_id: sJob.id }),
    slot(editions[0], quarterly.slots[2], 2),
    slot(editions[0], quarterly.slots[3], 3, { content: "A gift of any size keeps a Career Lab open for one more teen." }),
    slot(editions[1], quarterly.slots[0], 0, { content: "Every year-end gift is matched until December 31." }),
    slot(editions[1], quarterly.slots[1], 1, { story_id: sJob.id }),
    slot(editions[1], quarterly.slots[2], 2, { story_id: sShow.id }),
    slot(editions[1], quarterly.slots[3], 3, { content: "Double your gift today." }),
  ]);
  void validSegs;
  // The connected Gmail sender (G1). No token: the mock never sends.
  add("connections", [{ id: T.id(19), org_id: ORG_ID, provider: "google_gmail", external_id: "sender", status: "active", meta: { account_email: "hello@demo-angels.example", connected_by_email: "dana@demo-angels.example", connected_at: iso(daysAgo(20)) }, created_at: iso(daysAgo(20)), updated_at: iso(daysAgo(20)) }]);

  // ── partners, students, cohorts ──────────────────────────────────────────
  const partners = add("partners", [...SCHOOLS, ...NONPROFITS.slice(0, 4), ...COMPANIES.slice(0, 6)].map((n, i) => {
    const kind = i < SCHOOLS.length ? (n.includes("District") ? "district" : "school") : i < SCHOOLS.length + 4 ? "nonprofit" : "company";
    const [city] = T.pick(CITIES);
    return { id: T.id(20), org_id: ORG_ID, name: n, kind, status: T.pick(enums.partners.status), champion_name: `${FIRST[(i * 13 + 5) % FIRST.length]} ${LAST[(i * 17 + 1) % LAST.length]}`, champion_email: `champion${i}@example.org`, champion_role: kind === "company" ? "Head of People" : T.pick(["Counselor", "Assistant Principal", "CTE Coordinator"]), teen_count: String(T.int(20, 400)), program_type: T.pick(["Career Labs", "Internships", "After-school"]), mou_status: T.pick(enums.partners.mou_status), mou_start: ymd(daysAgo(200)), mou_end: ymd(daysFromNow(165)), last_touch_at: ymd(daysAgo(T.int(1, 90))), city, region: "Peninsula", created_at: iso(daysAgo(T.int(60, 600))), updated_at: iso(daysAgo(T.int(0, 30))), priority_score: T.int(20, 95), score_factors: {} };
  }));
  add("partner_contacts", partners.flatMap((p, i) => [{ id: T.id(20), org_id: ORG_ID, partner_id: p.id, first_name: p.champion_name.split(" ")[0], last_name: p.champion_name.split(" ")[1], email: p.champion_email, title: p.champion_role, is_primary: true, created_at: p.created_at }, { id: T.id(20), org_id: ORG_ID, partner_id: p.id, first_name: FIRST[(i * 3 + 9) % FIRST.length], last_name: LAST[(i * 7 + 2) % LAST.length], email: `contact${i}@example.org`, title: "Teacher", is_primary: false, created_at: p.created_at }]));
  add("partner_interactions", partners.flatMap((p, i) => Array.from({ length: 3 }, (_, k) => ({ id: T.id(20), org_id: ORG_ID, partner_id: p.id, kind: T.pick(["call", "email", "meeting"]), occurred_at: iso(daysAgo(k * 25 + i)), notes: T.pick(["Planned spring Career Lab dates.", "Sent MOU draft.", "Site visit with counselors."]), logged_by: "priya", created_at: iso(daysAgo(k * 25 + i)) }))));
  const schoolPartners = partners.filter((p) => p.kind === "school");

  const programs = add("programs", [
    { id: T.id(21), org_id: ORG_ID, name: "Career Labs", description: "Weekly hands-on career exploration", active: true },
    { id: T.id(21), org_id: ORG_ID, name: "Summer Internships", description: "Paid six-week introships", active: true },
  ]);
  const stageKeys = (reference.participant_stages || []).map((s) => s.stage_key);
  const students = add("students", Array.from({ length: 84 }, (_, i) => {
    const fn = STUDENT_FIRST[(i * 7) % STUDENT_FIRST.length];
    const ln = STUDENT_LAST[(i * 5 + 2) % STUDENT_LAST.length];
    const p = schoolPartners[i % schoolPartners.length];
    return { id: T.id(22), org_id: ORG_ID, first_name: fn, last_name: ln, email: null, phone: null, partner_id: p.id, location: p.name, stage: stageKeys.length ? stageKeys[Math.min(stageKeys.length - 1, Math.floor(Math.pow(T.r(), 1.3) * stageKeys.length))] : "learn", notes: null, last_activity_at: ymd(daysAgo(T.int(0, 60))), created_at: iso(daysAgo(T.int(20, 500))), updated_at: iso(daysAgo(T.int(0, 30))), custom_fields: { grade: String(T.int(8, 12)) } };
  }));
  const cohorts = add("cohorts", [
    { name: "Fall 2026 Career Lab: Eastlake", status: "active", start: -70, end: 30, p: 0 },
    { name: "Fall 2026 Career Lab: Riverside", status: "active", start: -65, end: 35, p: 1 },
    { name: "Fall 2026 Career Lab: Mission Ridge", status: "active", start: -60, end: 40, p: 2 },
    { name: "Summer 2026 Internships", status: "completed", start: -160, end: -110, p: 3 },
    { name: "Spring 2026 Career Lab: Westbrook", status: "completed", start: -260, end: -180, p: 3 },
    { name: "Winter 2027 Career Lab: Del Sol", status: "planning", start: 50, end: 140, p: 4 },
  ].map((c, i) => ({ id: T.id(23), org_id: ORG_ID, name: c.name, program: i === 3 ? "Summer Internships" : "Career Labs", program_id: programs[i === 3 ? 1 : 0].id, term: c.name.split(" ").slice(0, 2).join(" "), location: schoolPartners[c.p].name, partner_id: schoolPartners[c.p].id, capacity: 20, start_date: ymd(daysFromNow(c.start)), end_date: ymd(daysFromNow(c.end)), status: c.status, accepting_applications: c.status === "planning", owner_id: i % 2 ? team[2].id : i === 0 ? team[0].id : null, created_at: iso(daysAgo(200)) })));
  const members = [];
  cohorts.slice(0, 5).forEach((c, ci) => {
    for (let k = 0; k < 15; k++) {
      const s = students[(ci * 15 + k) % students.length];
      members.push({ id: T.id(24), org_id: ORG_ID, cohort_id: c.id, student_id: s.id, status: c.status === "completed" ? (k % 7 === 0 ? "dropped" : "completed") : k === 14 ? "dropped" : "enrolled", joined_on: c.start_date, created_at: iso(daysAgo(100)) });
    }
  });
  add("cohort_members", members);
  const sessions = [];
  cohorts.forEach((c) => {
    const start = new Date(c.start_date).getTime();
    for (let w = 0; w < 10; w++) {
      const d = new Date(start + w * 7 * DAY);
      sessions.push({ id: T.id(25), org_id: ORG_ID, cohort_id: c.id, session_date: ymd(d), title: `Week ${w + 1}: ${["Kickoff", "Healthcare", "Engineering", "Design", "Finance", "Trades", "Media", "Public service", "Tech", "Showcase"][w]}`, starts_at: "15:30:00", ends_at: "17:00:00", location: c.location, status: d < now ? (w === 4 && c.status === "active" ? "canceled" : "held") : "scheduled", created_at: iso(daysAgo(150)) });
    }
  });
  // V4 Stage E: a session today on the first cohort (owned by the signed-in
  // user), so Today and Attendance can open a live phone roster.
  sessions.push({ id: T.id(25), org_id: ORG_ID, cohort_id: cohorts[0].id, session_date: NOW.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }), title: "Week 11: Mock interviews", starts_at: "15:30:00", ends_at: "17:00:00", location: cohorts[0].location, status: "scheduled", created_at: iso(daysAgo(150)) });
  add("cohort_sessions", sessions);
  const att = [];
  for (const s of sessions.filter((x) => x.status === "held")) {
    for (const m of members.filter((x) => x.cohort_id === s.cohort_id)) {
      att.push({ id: T.id(26), org_id: ORG_ID, session_id: s.id, student_id: m.student_id, status: T.weighted([["present", 8], ["late", 1], ["excused", 0.6], ["absent", 1.2]]), method: "roster", recorded_by: "priya", recorded_at: iso(new Date(s.session_date)) });
    }
  }
  add("attendance", att);
  add("applications", Array.from({ length: 26 }, (_, i) => ({ id: T.id(27), org_id: ORG_ID, cohort_id: cohorts[5].id, first_name: STUDENT_FIRST[(i * 3 + 11) % STUDENT_FIRST.length], last_name: STUDENT_LAST[(i * 7 + 1) % STUDENT_LAST.length], grade: String(T.int(8, 11)), school: schoolPartners[4].name, guardian_name: "Parent/guardian on file", motivation: "I want to learn what jobs exist in healthcare.", status: T.pick(enums.applications.status), priority: T.int(1, 3), external_source: "web", created_at: iso(daysAgo(T.int(0, 30))) })));

  // coach
  const coachPeople = add("coach_people", Array.from({ length: 14 }, (_, i) => ({ id: T.id(28), org_id: ORG_ID, kind: i < 7 ? "coach" : "student", status: T.pick(enums.coach_people.status), first_name: i < 7 ? FIRST[(i * 9 + 4) % FIRST.length] : STUDENT_FIRST[i], last_name: i < 7 ? LAST[(i * 5 + 9) % LAST.length] : STUDENT_LAST[i], company: i < 7 ? T.pick(COMPANIES) : null, school: i >= 7 ? T.pick(SCHOOLS) : null, field: T.pick(["Healthcare", "Software", "Finance", "Design", "Trades"]), email: `coach${i}@example.com`, created_at: iso(daysAgo(T.int(1, 90))) })));
  const coachMatches = add("coach_matches", [0, 1, 2].map((k) => ({ id: T.id(28), org_id: ORG_ID, coach_id: coachPeople[k].id, student_id: coachPeople[7 + k].id, status: ["active", "intro_sent", "proposed"][k], intro_sent_at: k < 2 ? iso(daysAgo(30 + k)) : null, created_at: iso(daysAgo(10 + k)) })));
  // V4 Stage E: the four sessions of each match (two met, one past its date, one ahead on the first).
  add("coach_sessions", coachMatches.flatMap((m, k) => [1, 2, 3, 4].map((n) => ({ id: T.id(28), org_id: ORG_ID, match_id: m.id, n, scheduled_on: k === 0 ? ymd(daysFromNow([-21, -14, -3, 7][n - 1])) : null, done_at: k === 0 && n <= 2 ? iso(daysAgo([21, 14][n - 1])) : null, created_at: m.created_at }))));

  // ── work: projects, tasks, meetings, calendar, documents ──────────────────
  const objectives = add("plan_objectives", [
    { title: "Reach 5,000 teens with career exploration by 2028", owner: "priya", status: "on_track" },
    { title: "Build a durable, diversified revenue base", owner: "marcus", status: "at_risk" },
    { title: "Deepen school and district partnerships", owner: "priya", status: "on_track" },
    { title: "Strengthen the team and operating systems", owner: "dana", status: "behind" },
  ].map((o, i) => ({ id: T.id(30), org_id: ORG_ID, title: o.title, three_year_statement: "By 2028 every partner school runs Career Labs with its own staff.", owner: o.owner, status: o.status, sort_order: i, created_at: iso(daysAgo(300)), updated_at: iso(daysAgo(T.int(1, 20))) })));
  const goals = add("plan_goals", objectives.flatMap((o, i) => [0, 1, 2].map((k) => ({ id: T.id(31), org_id: ORG_ID, objective_id: o.id, title: [["Launch Career Labs at 4 new schools", "Run two summer internship cohorts", "Pilot the app with 500 teens"], ["Grow individual giving 25%", "Secure 3 new corporate partners", "Close two multi-year foundation grants"], ["Sign MOUs with 2 districts", "Train 12 school-site leads", "Publish a partner playbook"], ["Hire a program coordinator", "Adopt monthly close", "Board recruits 2 new members"]][i][k], description: null, target_date: ymd(daysFromNow(30 + k * 60)), status: T.pick(enums.plan_goals.status), sort_order: k, owner: o.owner, created_at: iso(daysAgo(280)), updated_at: iso(daysAgo(T.int(1, 30))) }))));
  const kpis = add("plan_kpis", goals.slice(0, 12).map((g, i) => ({ id: T.id(32), org_id: ORG_ID, goal_id: g.id, objective_id: g.objective_id, title: ["Teens reached (YTD)", "Internship placements", "App weekly actives", "Individual giving ($)", "Corporate partners", "Foundation dollars ($)", "District MOUs", "Site leads trained", "Playbook chapters", "Open roles filled", "Days to close books", "Board seats filled"][i], unit: [null, null, null, "usd", null, "usd", null, null, null, null, "days", null][i], target: [5000, 60, 500, 400000, 8, 600000, 2, 12, 6, 2, 10, 11][i], current: [3620, 41, 310, 287000, 5, 350000, 1, 7, 2, 1, 18, 9][i], owner: g.owner, cadence: "monthly", source: "manual", status: g.status, last_updated_at: iso(daysAgo(T.int(1, 40))), baseline: 0, baseline_date: ymd(daysAgo(300)), created_at: iso(daysAgo(280)), updated_at: iso(daysAgo(5)) })));
  add("plan_kpi_snapshots", kpis.flatMap((k) => Array.from({ length: 6 }, (_, m) => ({ org_id: ORG_ID, kpi_id: k.id, value: Math.round(k.current * (0.5 + m * 0.1)), captured_on: ymd(daysAgo((5 - m) * 30)), created_at: iso(daysAgo((5 - m) * 30)) }))));
  const initiatives = add("plan_initiatives", goals.slice(0, 8).map((g, i) => ({ id: T.id(33), org_id: ORG_ID, goal_id: g.id, title: ["Recruit spring schools", "Internship host outreach", "App onboarding sprint", "Monthly Angels campaign", "Corporate deck refresh", "Grant calendar", "District pitch", "Site lead curriculum"][i], owner: g.owner, status: i % 3 === 0 ? "done" : "in_progress", sort_order: i, created_at: iso(daysAgo(200)) })));
  add("plan_foundation", [{ org_id: ORG_ID, mission: "Help teens from under-resourced communities discover careers they did not know existed.", vision: "Every teen can name three careers they are excited about.", values: ["Curiosity", "Belonging", "Follow-through"], created_at: iso(daysAgo(300)) }]);
  add("plan_reviews", [{ id: T.id(33), org_id: ORG_ID, conducted_at: iso(daysAgo(25)), conducted_by: "dana", notes: "Program goals on track; revenue behind plan by 12%.", next_review_at: iso(daysFromNow(5)), created_at: iso(daysAgo(25)) }]);
  add("metric_snapshots", metricDefs.flatMap((m) => Array.from({ length: 8 }, (_, k) => ({ id: T.id(34), org_id: ORG_ID, metric_id: m.id, captured_on: ymd(daysAgo((7 - k) * 30)), value: m.unit === "pct" ? 60 + k * 2 + T.int(0, 4) : m.unit === "usd" ? 520 - k * 10 : Math.round((m.target || 300) * (0.45 + k * 0.06)), captured_by: team[2].id, created_at: iso(daysAgo((7 - k) * 30)) }))));

  const projects = add("ops_projects", [
    ["Spring Career Lab launch", "program", "priya"], ["Year-end appeal", "fundraising", "marcus"], ["FY27 budget", "finance", "lena"],
    ["Board recruitment", "board", "dana"], ["Program coordinator hire", "recruitment", "dana"], ["990 and audit prep", "compliance", "lena"],
    ["Summer internship hosts", "program", "priya"], ["Corporate partners deck", "fundraising", "marcus"], ["Website refresh", "admin", "dana"], ["Showcase 2027 planning", "program", "priya"],
  ].map(([title, category, who], i) => ({ id: T.id(40), org_id: ORG_ID, title, category, status: i === 8 ? "paused" : i === 9 ? "done" : "active", description: `Owner: ${who}. Milestones tracked as tasks.`, assigned_to: who, created_by: "dana", due_date: ymd(daysFromNow(T.int(10, 120))), last_touched_at: iso(daysAgo(T.int(0, 12))), created_at: iso(daysAgo(T.int(40, 200))), updated_at: iso(daysAgo(T.int(0, 12))), initiative_id: initiatives[i % initiatives.length].id })));
  const taskTitles = ["Call Harborview program officer", "Send Q3 grant report", "Finalize spring school list", "Book showcase venue", "Draft year-end appeal letter", "Review October close", "Update board deck", "Order Career Lab supplies", "Reconcile Stripe payouts", "Schedule site lead training", "Thank new monthly donors", "Prep district pitch", "Collect intern timesheets", "Renew D&O insurance", "Post coordinator job", "Interview candidates", "Approve budget draft", "Update KPI dashboard", "Clean duplicate donors", "Send MOU to Westbrook", "Confirm mentor roster", "Write impact story", "File state charitable renewal", "Plan board retreat agenda", "Follow up on corporate ask", "Upload signed MOUs", "Review internship evaluations", "Set December comms calendar", "Check app analytics", "Prepare 1:1 notes"];
  const tasks = add("ops_tasks", Array.from({ length: 62 }, (_, i) => {
    const proj = i % 4 === 3 ? null : projects[i % projects.length];
    const status = i < 14 ? "done" : i < 20 ? "in_progress" : i === 21 ? "blocked" : "todo";
    const due = status === "done" ? daysAgo(T.int(1, 30)) : daysFromNow(T.int(-6, 25));
    const who = proj?.assigned_to || T.pick(staffHandles);
    const person = team.find((p) => p.key === who);
    return {
      id: T.id(41), org_id: ORG_ID, title: taskTitles[i % taskTitles.length] + (i >= taskTitles.length ? " (follow-up)" : ""), description: i % 3 === 0 ? "Notes: check last year's version first." : null,
      project_id: proj?.id ?? null, category: proj ? (["fundraising", "program", "finance", "board", "compliance"].includes(proj.category) ? proj.category : "operations") : T.pick(enums.ops_tasks.category),
      status, assigned_to: who, assigned_to_id: person?.id ?? null, created_by: "dana", due_date: ymd(due), pinned_for_today: status !== "done" && i % 9 === 0, pinned_for_this_week: status !== "done" && i % 5 === 0,
      display_order: i, created_at: iso(daysAgo(T.int(1, 20))), updated_at: iso(daysAgo(T.int(0, 5))), completed_at: status === "done" ? iso(due) : null,
      priority: T.pick(enums.ops_tasks.priority), labels: [], roll_count: 0, planned_day: status !== "done" && i % 4 === 0 ? ymd(new Date(startOfWeek.getTime() + (i % 5) * DAY)) : null,
      planned_week: ymd(startOfWeek), linked_entity_type: i % 7 === 0 ? "constituent" : null, linked_entity_id: i % 7 === 0 ? people[i].id : null, linked_label: i % 7 === 0 ? `${people[i].first_name} ${people[i].last_name}` : null,
      estimated_minutes: T.pick([15, 30, 60, 90]),
    };
  }));
  add("plan_objective_tasks", tasks.slice(20, 28).map((t, i) => ({ id: T.id(41), org_id: ORG_ID, objective_id: objectives[i % 4].id, title: t.title, assignee: t.assigned_to, status: t.status === "done" ? "done" : "todo", due_date: t.due_date, sort_order: i, created_at: iso(daysAgo(10)) })));

  const events = [];
  for (let d = 0; d < 10; d++) {
    const day = new Date(startOfWeek.getTime() + d * DAY);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const slots = [[9, "Team standup"], [11, T.pick(["Donor coffee: " + people[d].first_name + " " + people[d].last_name, "Site visit: " + SCHOOLS[d % 6], "Program officer call"])], [14, T.pick(["Career Lab planning", "Budget review", "Board committee", "1:1 with Priya"])], [16, "Career Lab session"]];
    for (const [h, title] of slots) {
      events.push({ id: T.id(42), org_id: ORG_ID, owner_user_id: team[0].id, google_event_id: `g${d}${h}`, calendar_id: "primary", title, location: h === 16 ? SCHOOLS[d % 6] : "Video call", start_time: iso(at(day, h)), end_time: iso(at(day, h + 1)), all_day: false, status: "confirmed", attendees: title.startsWith("Donor") ? [{ email: people[d].emails[0], displayName: `${people[d].first_name} ${people[d].last_name}` }] : [], is_external: title.startsWith("Donor") || title.startsWith("Program"), source: "google", synced_at: iso(daysAgo(0)), created_at: iso(daysAgo(14)) });
    }
  }
  add("calendar_events", events);
  const meetingRecords = add("meeting_records", Array.from({ length: 16 }, (_, i) => ({ id: T.id(43), org_id: ORG_ID, owner_user_id: team[i % 3].id, title: T.pick(["Program officer check-in", "Donor coffee", "District pitch rehearsal", "Board finance committee", "Partner kickoff", "Mentor orientation"]), occurred_at: iso(daysAgo(i * 3 + 1)), source: T.pick(["calendar", "manual"]), summary: "Discussed spring timeline, two follow-ups agreed: send the one-pager and confirm dates.", store_transcript: false, follow_up_status: T.pick(enums.meeting_records.follow_up_status), created_at: iso(daysAgo(i * 3 + 1)) })));
  add("meeting_suggested_tasks", meetingRecords.slice(0, 4).map((m) => ({ id: T.id(43), org_id: ORG_ID, meeting_record_id: m.id, suggested_title: "Send the impact one-pager", suggested_category: "fundraising", status: "pending", created_at: m.created_at })));
  const meetingTypes = add("meeting_types", [{ id: T.id(44), org_id: ORG_ID, slug: "intro", name: "Intro call", duration_minutes: 30, is_active: true, description: "A short intro call." }]);
  add("bookings", Array.from({ length: 5 }, (_, i) => ({ id: T.id(44), org_id: ORG_ID, meeting_type_id: meetingTypes[0].id, location_type: "video", attendee_name: `${FIRST[i + 20]} ${LAST[i + 20]}`, attendee_email: `booker${i}@example.com`, attendee_timezone: "America/Los_Angeles", start_time: iso(at(daysFromNow(i + 1), 10 + i)), end_time: iso(at(daysFromNow(i + 1), 10 + i, 30)), status: "confirmed", created_at: iso(daysAgo(2)) })));

  add("documents", Array.from({ length: 22 }, (_, i) => {
    const docs = [["Board-approved FY26 budget.pdf", "budget"], ["IRS determination letter.pdf", "determination_letter"], ["Certificate of insurance 2026.pdf", "insurance"], ["Westbrook MOU signed.pdf", "mou"], ["Harborview grant agreement.pdf", "grant_agreement"], ["Employee handbook v3.pdf", "policy"], ["Whistleblower policy.pdf", "policy"], ["Form 990 FY25.pdf", "form_990"], ["Audit FY25.pdf", "audit"], ["Career Lab facilitator guide.pdf", "program"], ["Data sharing agreement Eastlake.pdf", "mou"]];
    const [fn, type] = docs[i % docs.length];
    return { id: T.id(45), org_id: ORG_ID, storage_path: `demo/${i}/${fn}`, filename: fn, mime: "application/pdf", size_bytes: T.int(80000, 2400000), title: fn.replace(/\.pdf$/, "") + (i >= docs.length ? " (copy)" : ""), doc_type: type, status: "active", visibility: "org", version: 1, expires_at: type === "insurance" ? ymd(daysFromNow(40)) : null, uploaded_by: team[i % 4].id, created_at: iso(daysAgo(T.int(5, 300))), updated_at: iso(daysAgo(T.int(0, 30))), issued_at: ymd(daysAgo(T.int(30, 300))) };
  }));

  // ── finance ───────────────────────────────────────────────────────────────
  const year = now.getFullYear();
  add("fin_config", [{ id: 1, org_id: ORG_ID, fiscal_year_start_month: 1, current_year: year, fundraising_goal: 900000, contingency_unlock_threshold: 0.75, cash_starting_balance: 412000, cash_starting_date: `${year - 1}-12-31`, updated_at: iso(daysAgo(2)), cash_reconciled_at: iso(daysAgo(2)), last_reconciled_at: iso(daysAgo(2)), monthly_burn_baseline: 68000, forward_horizon_months: 12, runway_target_months: 6 }]);
  const cats = (reference.fin_categories || []).filter((c) => c.enabled !== false);
  const expCats = ["payroll.salaries-wages", "payroll.taxes", "payroll.benefits", "occupancy.rent", "admin.insurance-general", "prof.accounting", "fundraising.donor-platform", "marketing.website-sub", "program.course-equipment", "program.engagement", "travel.meals", "admin.bank-fees"].filter((id) => cats.some((c) => c.id === id));
  const budgets = { "payroll.salaries-wages": 520000, "payroll.taxes": 42000, "payroll.benefits": 60000, "occupancy.rent": 36000, "admin.insurance-general": 9000, "prof.accounting": 18000, "fundraising.donor-platform": 6000, "marketing.website-sub": 4000, "program.course-equipment": 30000, "program.engagement": 45000, "travel.meals": 8000, "admin.bank-fees": 2400, "revenue.foundations": 420000, "revenue.individuals": 300000, "revenue.corporate": 150000, "revenue.gov-grants": 50000 };
  add("fin_budget", Object.entries(budgets).filter(([id]) => cats.some((c) => c.id === id)).flatMap(([id, amt]) => [year, year + 1].map((y) => ({ year: y, category_id: id, base_amount: y === year ? amt : Math.round(amt * 1.08), contingency_t1: Math.round(amt * 0.05), contingency_t2: Math.round(amt * 0.05), activated_contingency: 0, org_id: ORG_ID, created_at: iso(daysAgo(300)) }))));
  const txns = [];
  const vendors = { "payroll.salaries-wages": "Gusto payroll", "payroll.taxes": "Gusto tax", "payroll.benefits": "Benefits carrier", "occupancy.rent": "Demo Workspace Co rent", "admin.insurance-general": "Insurance premium", "prof.accounting": "Bookkeeping retainer", "fundraising.donor-platform": "Donor CRM subscription", "marketing.website-sub": "Website hosting", "program.course-equipment": "Career Lab supplies", "program.engagement": "Student stipends", "travel.meals": "Team meals", "admin.bank-fees": "Bank service fee" };
  for (let m = 17; m >= 0; m--) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    for (const id of expCats) {
      const monthly = (budgets[id] || 6000) / 12;
      const n = id.startsWith("payroll.salaries") ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const d = new Date(base.getTime() + T.int(1, 26) * DAY);
        if (d > now) continue;
        txns.push({ id: T.id(50), org_id: ORG_ID, txn_date: ymd(d), description: vendors[id] || id, amount: -money((monthly / n) * (0.8 + T.r() * 0.4)), category_id: id, restricted: false, source_file: "bank-export.csv", dedup_hash: `h${txns.length}`, uploaded_at: iso(d), uploaded_by: "lena", updated_at: iso(d), exclude_from_runway: false });
      }
    }
    // revenue deposits
    for (let k = 0; k < 4; k++) {
      const d = new Date(base.getTime() + T.int(1, 27) * DAY);
      if (d > now) continue;
      const cat = T.pick(["revenue.individuals", "revenue.individuals", "revenue.foundations", "revenue.corporate"]);
      txns.push({ id: T.id(50), org_id: ORG_ID, txn_date: ymd(d), description: cat === "revenue.individuals" ? "Stripe payout" : cat === "revenue.foundations" ? `${T.pick(foundations).org_name} grant payment` : `${T.pick(companies).org_name} sponsorship`, amount: money(cat === "revenue.individuals" ? T.int(6000, 22000) : T.int(10000, 60000)), category_id: cat, restricted: cat === "revenue.foundations" && T.chance(0.3), restricted_to: null, source_file: "bank-export.csv", dedup_hash: `h${txns.length}`, uploaded_at: iso(d), uploaded_by: "lena", updated_at: iso(d), exclude_from_runway: false });
    }
  }
  // a few uncategorized recent ones (reconcile queue)
  for (let k = 0; k < 6; k++) txns.push({ id: T.id(50), org_id: ORG_ID, txn_date: ymd(daysAgo(k + 1)), description: ["AMZN Mktp order", "SQ *Corner Cafe", "Zoom subscription", "Lyft ride", "Office Depot", "Check deposit #1042"][k], amount: k === 5 ? 1500 : -money(T.int(12, 400)), category_id: null, restricted: false, source_file: "bank-export.csv", dedup_hash: `u${k}`, uploaded_at: iso(daysAgo(1)), uploaded_by: "lena", updated_at: iso(daysAgo(1)), exclude_from_runway: false });
  add("fin_transactions", txns);
  add("fin_revenue_commitments", pledges.slice(0, 6).map((p, i) => ({ id: T.id(51), org_id: ORG_ID, year: NOW.getFullYear(), source_type: i < 4 ? "foundation" : "corporate", source_name: `Multi-year commitment ${i + 1}`, amount: money(p.total_amount / p.installment_count), expected_date: ymd(daysFromNow(20 + i * 30)), probability: 0.9, status: i < 2 ? "secured" : "projected", created_at: iso(daysAgo(30)) })));
  add("fin_category_rules", [{ id: T.id(51), org_id: ORG_ID, pattern: "Gusto", pattern_type: "contains", category_id: "payroll.salaries-wages", hit_count: 34, enabled: true, priority: 10, created_at: iso(daysAgo(200)) }, { id: T.id(51), org_id: ORG_ID, pattern: "Stripe payout", pattern_type: "contains", category_id: "revenue.individuals", hit_count: 70, enabled: true, priority: 10, created_at: iso(daysAgo(200)) }]);
  add("fin_reconciliation_items", gifts.slice(0, 3).map((g, i) => ({ id: T.id(51), org_id: ORG_ID, kind: "commitment", source: ["gmail", "hubspot", "stripe"][i], status: "pending", confidence: ["high", "medium", "low"][i], title: `Possible unrecorded gift ${i + 1}`, detail: "Email thread mentions a pledged amount not yet in the ledger.", amount: g.amount, payload: {}, created_by: "finance-reconcile", created_at: iso(daysAgo(i + 1)) })));

  // ── organization: board, compliance ──────────────────────────────────────
  const boardNames = ["Theo Brandt", "Rosalind Achebe", "Kenji Morales", "Harriet Lindgren", "Samuel Oduya", "Beatrix Castellanos", "Gareth Pennington", "Imogen Nakagawa", "Dana Whitfield"];
  const boardMembers = add("board_members", boardNames.map((n, i) => ({ id: T.id(60), org_id: ORG_ID, name: n, email: `${slug(n)}@example.com`, officer_role: ["chair", "vice_chair", "treasurer", "secretary"][i] || "member", term_start: ymd(daysAgo(300 + i * 60)), term_end: ymd(daysFromNow(400 - i * 40)), term_number: 1 + (i % 2), coi_signed_at: i === 6 ? null : ymd(daysAgo(T.int(30, 300))), status: "active", affiliation: T.pick(COMPANIES), title: T.pick(["VP Engineering", "Retired educator", "Partner", "CFO", "Community organizer"]), checklist: {}, is_staff: n === "Dana Whitfield", is_voting: n !== "Dana Whitfield", receives_shared_notes: true, created_at: iso(daysAgo(600)) })));
  const boardMeetings = add("board_meetings", [
    { t: "Q4 Board Meeting", d: 18, status: "upcoming", type: "regular" }, { t: "Q3 Board Meeting", d: -72, status: "closed", type: "regular" },
    { t: "Budget Meeting FY27", d: 32, status: "upcoming", type: "budget" }, { t: "Q2 Board Meeting", d: -160, status: "closed", type: "regular" },
  ].map((m) => ({ id: T.id(61), org_id: ORG_ID, meeting_date: ymd(daysFromNow(m.d)), title: m.t, agenda: [{ title: "Welcome and consent agenda", minutes: 10 }, { title: "ED report", minutes: 20 }, { title: "Finance committee report", minutes: 20 }, { title: "Strategic plan check-in", minutes: 30 }], attendance: m.status === "closed" ? boardMembers.slice(0, 7).map((b) => ({ member_id: b.id, present: true })) : [], quorum_met: m.status === "closed" ? true : null, minutes: m.status === "closed" ? "Meeting called to order at 6:02pm. Consent agenda approved." : null, minutes_status: m.status === "closed" ? "approved" : "draft", meeting_type: m.type, starts_at: iso(at(daysFromNow(m.d), 18)), ends_at: iso(at(daysFromNow(m.d), 20)), location: "Demo Workspace, Room 2", status: m.status, quorum_required: 5, headline_stats: {}, created_at: iso(daysAgo(200)) })));
  add("agenda_items", boardMeetings.slice(0, 1).flatMap((m) => ["Consent agenda", "ED report", "Finance report", "Vote: FY27 budget"].map((t, i) => ({ id: T.id(61), org_id: ORG_ID, meeting_id: m.id, title: t, position: i, duration_minutes: 15, created_at: iso(daysAgo(5)) }))));
  add("compliance_items", [
    ["form_990", "Form 990 (FY25)", "IRS", 45, "annual", "in_progress"], ["state_charitable", "CA RRF-1 annual renewal", "CA AG", 60, "annual", "upcoming"], ["corporate_report", "Statement of Information", "CA SOS", 120, "biennial", "upcoming"],
    ["employment_tax", "Q4 payroll tax filings", "IRS/EDD", 70, "quarterly", "upcoming"], ["insurance", "D&O insurance renewal", null, 40, "annual", "upcoming"], ["insurance", "General liability renewal", null, -5, "annual", "upcoming"],
    ["policy", "Conflict of interest attestations", null, 25, "annual", "in_progress"], ["public_disclosure", "Post 990 publicly", null, 200, "annual", "upcoming"], ["contract", "Eastlake data sharing agreement", null, 90, "none", "upcoming"],
    ["form_990", "Form 990 (FY24)", "IRS", -300, "annual", "filed"], ["state_charitable", "City business license", "Demo City", 15, "annual", "upcoming"], ["custom", "Child safety training for mentors", null, 10, "annual", "in_progress"],
  ].map(([kind, title, jur, due, recur, status], i) => ({ id: T.id(62), org_id: ORG_ID, kind, title, jurisdiction: jur, due_date: ymd(daysFromNow(due)), recur, status, assigned_to: i % 2 ? "lena" : "dana", assigned_to_id: i % 2 ? team[3].id : team[0].id, notes: null, last_filed_at: status === "filed" ? iso(daysAgo(300)) : null, checklist: [], why_it_matters: "Missing this puts our charitable registration at risk.", created_at: iso(daysAgo(300)) })));
  add("compliance_filings", [{ id: T.id(62), org_id: ORG_ID, item_id: tables.compliance_items[9].id, filed_date: ymd(daysAgo(300)), filed_by: "lena", created_at: iso(daysAgo(300)) }]);

  // staff goals / kpis / reviews
  add("staff_goals", staffRows.map((s, i) => ({ id: T.id(63), org_id: ORG_ID, staff_id: s.id, title: ["Close 3 multi-year grants", "Raise $400k individual giving", "Launch 4 new Career Labs", "Monthly close in 10 days"][i], metric_type: "numeric", target_value: [3, 400000, 4, 10][i], current_value: [1, 287000, 3, 18][i], period: "FY2026", status: ["on_track", "at_risk", "on_track", "behind"][i], approval_status: "approved", sort_order: 0, created_at: iso(daysAgo(100)) })));
  add("staff_kpis", staffRows.map((s, i) => ({ id: T.id(63), org_id: ORG_ID, staff_id: s.id, title: ["Grant dollars", "Donor retention", "Teens served", "Close days"][i], target: [600000, 70, 1200, 10][i], current: [350000, 61, 890, 18][i], unit: ["usd", "pct", null, "days"][i], cadence: "monthly", source: "manual", status: "on_track", sort_order: 0, created_at: iso(daysAgo(100)) })));
  add("review_cycles", [{ id: T.id(63), org_id: ORG_ID, name: "Fall 2026 reviews", status: "collecting", anonymity_mode: "confidential", opens_on: ymd(daysAgo(10)), closes_on: ymd(daysFromNow(20)), created_at: iso(daysAgo(12)) }]);

  // ── inbox: notifications + messages ──────────────────────────────────────
  add("notifications", Array.from({ length: 24 }, (_, i) => {
    const kinds = [["mention", "Marcus mentioned you on a task", "Can you review the year-end appeal draft?", "/admin/work/tasks"], ["assignment", "New task assigned: Renew D&O insurance", null, "/admin/work/tasks"], ["gift", `New gift: $${[250, 1000, 50][i % 3]} from ${people[i].first_name} ${people[i].last_name}`, null, `/admin/fundraising/donors-funders/${people[i].id}`], ["deadline", "Compliance due in 5 days: General liability renewal", null, "/admin/organization/compliance"], ["comment", "Priya commented on Spring Career Lab launch", "Schools confirmed for weeks 1 to 4.", "/admin/work/projects"]];
    const [type, title, body, url] = kinds[i % kinds.length];
    return { id: T.id(70), org_id: ORG_ID, recipient_id: team[0].id, actor_id: team[1 + (i % 3)].id, type, title, body, url, read_at: i > 6 ? iso(daysAgo(i / 2)) : null, created_at: iso(new Date(now.getTime() - i * 5 * 3600000)) };
  }));
  const threads = add("message_threads", [
    { title: null, is_group: false, with: 1 }, { title: null, is_group: false, with: 2 }, { title: "Year-end appeal crew", is_group: true, with: [1, 3] }, { title: "Spring Career Labs", is_group: true, with: [2, 3] },
  ].map((t, i) => ({ id: T.id(71), org_id: ORG_ID, is_group: t.is_group, title: t.title, dm_key: t.is_group ? null : [team[0].id, team[t.with].id].sort().join(":"), created_by: team[0].id, last_message_at: iso(new Date(now.getTime() - i * 7 * 3600000)), created_at: iso(daysAgo(30)), _with: t.with })));
  const tm = [];
  const msgs = [];
  const lines = ["Do we have the final numbers for the impact update?", "Yes, sending them over in an hour.", "Great. Can we also add the internship stat?", "Done. Draft is in the shared folder.", "Thanks! I'll review tonight.", "Reminder: venue walkthrough Thursday at 3."];
  threads.forEach((t, i) => {
    const others = Array.isArray(t._with) ? t._with : [t._with];
    for (const k of [0, ...others]) tm.push({ thread_id: t.id, user_id: team[k].id, org_id: ORG_ID, last_read_at: k === 0 && i > 1 ? iso(daysAgo(1)) : iso(now), added_at: iso(daysAgo(30)) });
    lines.forEach((l, j) => msgs.push({ id: T.id(72), thread_id: t.id, org_id: ORG_ID, sender_id: team[j % 2 === 0 ? others[0] : 0].id, body: l, created_at: iso(new Date(now.getTime() - i * 7 * 3600000 - (lines.length - j) * 1800000)) }));
    delete t._with;
  });
  add("message_thread_members", tm);
  add("messages", msgs);

  // content: a few career cards
  add("ms_occupations", Array.from({ length: 8 }, (_, i) => ({ soc_code: `29-${1000 + i}.00`, title: ["Respiratory Therapist", "Wind Turbine Technician", "UX Researcher", "Dental Hygienist", "Civil Drafter", "Sound Engineering Tech", "Actuary", "Urban Planner"][i], riasec: { R: 4, I: 5, A: 2, S: 3, E: 2, C: 3 }, job_zone: 3, pay_median: 70000 + i * 5000, education_typical: "Associate degree", imported_at: iso(daysAgo(100)) })));
  add("ms_cards", tables.ms_occupations.map((o, i) => ({ soc_code: o.soc_code, field: ["health","trades","tech","health","trades","creative","business","public"][i], day_vignette: "You start the day checking equipment, then meet your first patient.", clue_1: "You work with your hands and your head.", status: ["approved", "approved", "draft", "draft", "approved", "draft", "approved", "retired"][i], generated_by: "claude", generated_at: iso(daysAgo(50)), reviewed_by: "priya", reviewed_at: iso(daysAgo(40)), created_at: iso(daysAgo(50)) })));

  // campaign plan strategies (Campaigns → plan detail)
  const strategies = add("fr_plan_strategies", [
    ["Grow monthly giving", 60000, "marcus"], ["Corporate partner sponsorships", 200000, "marcus"], ["Multi-year foundation grants", 420000, "dana"],
  ].map(([name, goal, owner], i) => ({ id: T.id(81), org_id: ORG_ID, plan_year: NOW.getFullYear(), name, goal, owner, notes: "Reviewed monthly with the ED.", sort: i, created_at: iso(daysAgo(200)) })));
  campaigns[4].plan_strategy_id = strategies[0].id;
  campaigns[2].plan_strategy_id = strategies[1].id;
  grants.slice(0, 6).forEach((g) => (g.plan_strategy_id = strategies[2].id));

  // website analytics (aa.site_analytics)
  const pages = ["/", "/how-it-works", "/curriculum", "/schools", "/companies", "/donate", "/teens", "/teens/higher-wage", "/about", "/impact"];
  add("page_views", Array.from({ length: 900 }, (_, i) => ({ id: i + 1, org_id: ORG_ID, created_at: iso(new Date(NOW.getTime() - Math.floor(Math.pow(T.r(), 1.2) * 30 * DAY))), page: T.weighted(pages.map((p, k) => [p, 10 - k])), referrer: T.pick(["google.com", "", "instagram.com", "linkedin.com", "newsletter"]), device: T.weighted([["mobile", 6], ["desktop", 4], ["tablet", 0.5]]), browser: T.pick(["Safari", "Chrome", "Chrome", "Edge"]), session_id: `s${Math.floor(i / 3)}`, duration_seconds: T.int(5, 240) })));
  add("click_events", Array.from({ length: 160 }, (_, i) => ({ id: i + 1, org_id: ORG_ID, created_at: iso(daysAgo(T.int(0, 29))), event_name: T.pick(["donate_click", "schools_inquiry", "app_download", "play_game"]), page: T.pick(pages), session_id: `s${i * 2}`, metadata: {} })));

  // a Gmail-connected-ish backlog for Meetings → connection candidates
  add("connection_candidates", people.slice(40, 44).map((p, i) => ({ id: T.id(83), org_id: ORG_ID, thread_id: `thr${i}`, constituent_id: p.id, subject: ["Coffee next week?", "Re: internship hosting", "Intro from a friend", "Spring panel"][i], status: "pending", created_at: iso(daysAgo(i + 1)) })));

  // ygb registrations (aa.ygb) left empty on purpose.

  // V4 Stage C: one Talk to log recording with the four card kinds, waiting
  // to be confirmed (the parse needs a model, so the harness seeds its result).
  const capId = "c4c4c4c4-0000-4000-8000-000000000001";
  const donor = people[0];
  const donorName = `${donor.first_name} ${donor.last_name}`;
  const recordedAt = iso(new Date(now.getTime() - 40 * 60 * 1000));
  add("captures", [{
    id: capId, org_id: ORG_ID, created_by: team[0].id, source_surface: "mobile_plus", context_type: null, context_id: null,
    transcript: `Had coffee with ${donor.first_name} this morning. She wants to see the spring cohort first. Put her down for fifteen thousand, probably December. I owe her the site-visit dates by Friday. And her tour guide Jaylen went on to start a robotics club.`,
    duration_seconds: 40, status: "ready", parse_error: null, model_used: "fixture", ai_call_id: null, snoozed_until: null, created_at: recordedAt, updated_at: recordedAt,
  }]);
  const card = (n, dest, status, payload, entity) => ({
    id: `c4c4c4c4-0000-4000-8000-00000000010${n}`, org_id: ORG_ID, capture_id: capId, created_by: team[0].id, position: n, dest, status,
    entity_type: entity ? "constituent" : null, entity_id: entity ? donor.id : null, heard_name: entity ? donor.first_name : null,
    match_confidence: entity ? 0.92 : null, match_candidates: entity ? [{ kind: "constituent", id: donor.id, name: donorName, org_name: null, meta: "person", sim: 0.95 }] : [],
    payload: { ai_drafted: true, ...payload, ...(entity ? { entity_name: donorName } : {}) }, decided_by: null, decided_at: null, applied_table: null, applied_id: null,
    created_at: recordedAt, updated_at: recordedAt,
  });
  add("capture_cards", [
    card(1, "interaction", "proposed", { kind: "meeting", notes: "Coffee. Wants to see the spring cohort first.", occurred_at: ymd(now), uncertain: [], source_sentence: `Had coffee with ${donor.first_name} this morning.` }, true),
    card(2, "task", "proposed", { title: `Send ${donor.first_name} the spring site-visit dates`, category: "fundraising", due_date: ymd(daysFromNow(3)), assignee: { handle: "dana", user_id: team[0].id, name: team[0].displayName }, notes: null, uncertain: [] }, true),
    card(3, "thought", "held", { card_kind: "gift", gift_type: "pledge", amount: 15000, amount_heard: "fifteen thousand", expected: "December", gift_date: null, notes: null, uncertain: ["amount", "date"], source_sentence: "Put her down for fifteen thousand, probably December." }, true),
    card(4, "thought", "held", { card_kind: "story", title: "The tour guide who started a club", text: "Her student tour guide went on to start a robotics club.", about: "Jaylen M.", identifiable: true, consent: "needed", uncertain: [] }, false),
    // A Stage C draft that was KEPT before the story bank existed (Stage D moves it in).
    { ...card(6, "thought", "confirmed", { card_kind: "story", title: "Coach notes on a first paycheck", text: "Marisol K. brought her first pay stub to Career Lab and walked the group through it.", about: "Marisol K.", identifiable: true, consent: "needed", uncertain: [], filed: { table: "capture_cards", kept: true } }, false), decided_at: recordedAt },
    card(5, "thought", "held", { card_kind: "gift", gift_type: "gift", amount: 500, amount_heard: "500", gift_date: ymd(now), notes: null, uncertain: [] }, true),
  ]);
}
