"use client";

import { useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { useToast } from "../../_components/feedback/ToastProvider";
import {
  Button,
  CheckboxField,
  DateField,
  Drawer,
  EmptyState,
  Figure,
  FilterRow,
  IdentityChip,
  Modal,
  NextStepBar,
  Notice,
  PageHeader,
  SavedViews,
  SaveViewButton,
  SelectField,
  SkeletonGroup,
  SkeletonHeader,
  SkeletonStrip,
  SkeletonTable,
  SkeletonTimeline,
  StatCard,
  SummaryStrip,
  TextField,
  TextareaField,
  Timeline,
  TimelineChip,
  type TimelineEntry,
} from "../../_components/ui";

/**
 * The kit review gallery. Everything here is made up (the prototype cast:
 * Dana Whitfield, Harlow Family Fund, Priya Raman ...). Nothing saves.
 */

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-12 first:mt-0 scroll-mt-24">
      <h2 id={`${id}-h`} className={TYPE.sectionTitle}>
        {title}
      </h2>
      {note ? <p className={`${TYPE.bodyMuted} mt-1 max-w-reading`}>{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Specimen({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`${TYPE.sectionHeader} mb-2`}>{label}</div>
      {children}
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-hairline rounded-panel p-5 ${className}`}>{children}</div>;
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  email: "M3 6h18v12H3zM3 7l9 7 9-7",
  talk: "M4 5h16v11H9l-5 4z",
  task: "M5 12l4 4 10-10",
  thanks: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  gift: "M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C10 3 6 4 7.5 6.5M12 7c2-4 6-3 4.5-0.5",
  people: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11.5a2.5 2.5 0 1 0 0-5M17 14c2.6 0 4.5 1.8 4.5 4.5",
  plus: "M12 5v14M5 12h14",
};

const ENTRIES: TimelineEntry[] = [
  {
    id: "e1",
    kind: "email",
    icon: <Icon d={ICONS.email} />,
    title: "Email: Fall impact update",
    chips: (
      <>
        <TimelineChip tone="success">Opened</TimelineChip>
        <TimelineChip tone="success">Clicked</TimelineChip>
      </>
    ),
    meta: "Sent from Comms by Maya to Major donors (48 people). Opens are estimates.",
    actions: <Button variant="secondary" size="sm">View email</Button>,
    date: "Nov 18",
  },
  {
    id: "e2",
    kind: "conversation",
    icon: <Icon d={ICONS.talk} />,
    title: "Coffee with Dana",
    meta: "Conversation logged by Maya. Set next step: Send year-end ask.",
    body: "Wants to see the coach program before year end. Open to a larger gift if it funds summer introships.",
    actions: <Button variant="secondary" size="sm">Edit</Button>,
    date: "Nov 6",
  },
  {
    id: "e3",
    kind: "task",
    icon: <Icon d={ICONS.task} />,
    title: "Task done: Send Q3 program report",
    meta: "Done by Lena, a day early",
    actions: <Button variant="secondary" size="sm">Open task</Button>,
    date: "Oct 20",
  },
  {
    id: "e4",
    kind: "gift",
    icon: <Icon d={ICONS.gift} />,
    title: "Gift: $10,000",
    chips: (
      <>
        <TimelineChip tone="success">Thanked Oct 5</TimelineChip>
        <TimelineChip>Receipt sent</TimelineChip>
      </>
    ),
    meta: "Check #4471. General fund, Fall appeal 2026. Entered by Lena.",
    actions: (
      <>
        <Button variant="secondary" size="sm">Edit</Button>
        <Button variant="secondary" size="sm">Receipt</Button>
      </>
    ),
    date: "Oct 3",
  },
  {
    id: "e5",
    kind: "email",
    icon: <Icon d={ICONS.thanks} />,
    title: "Thank-you for the $10,000 gift",
    chips: <TimelineChip tone="success">Opened</TimelineChip>,
    meta: "Emailed by Maya from Gmail. Template: Major gift thanks.",
    actions: <Button variant="secondary" size="sm">View email</Button>,
    date: "Oct 5",
  },
];

const TIMELINE_FILTERS = [
  { key: "all", label: "All" },
  { key: "gift", label: "Gifts" },
  { key: "conversation", label: "Conversations" },
  { key: "email", label: "Emails" },
  { key: "task", label: "Tasks" },
];

const DONOR_VIEWS = [
  { key: "all", label: "All" },
  { key: "lapsed", label: "Lapsed" },
  { key: "mine", label: "My donors", mine: true },
  { key: "recurring", label: "Recurring" },
  { key: "major", label: "Major donors" },
];

const MORE = [
  { label: "Import donors", href: "#" },
  { label: "Export this view", onSelect: () => undefined },
  { label: "Find duplicates", onSelect: () => undefined },
  { label: "Archive selected", onSelect: () => undefined, danger: true },
];

// ── Composed sample 1: the top of Main.dc.html ───────────────────────────
function MainTop() {
  const [view, setView] = useState("mine");
  const [q, setQ] = useState("");
  const [ownerMe, setOwnerMe] = useState(true);
  return (
    <div className="bg-app border border-hairline rounded-modal p-4 sm:p-6">
      <PageHeader
        title="Donors & Funders"
        primaryAction={<Button size="lg">Record a gift</Button>}
        moreActions={MORE}
      />
      <SavedViews views={DONOR_VIEWS} activeKey={view} onSelect={setView} saveSlot={<SaveViewButton />} />
      <FilterRow
        search={{ value: q, onChange: setQ, label: "Search donors", placeholder: "name, email, tag" }}
        filters={{ count: ownerMe ? 1 : 0, onClick: () => undefined }}
        sort={{ label: "Sort: next step due", onClick: () => undefined }}
        quickFilters={[
          { key: "owner", label: "Owner: me", active: ownerMe, onClick: () => setOwnerMe((v) => !v) },
          { key: "type", label: "Type", hasMenu: true },
          { key: "last", label: "Last gift", hasMenu: true },
          { key: "life", label: "Lifetime giving", hasMenu: true },
        ]}
        onClearAll={() => {
          setOwnerMe(false);
          setQ("");
        }}
        advanced={
          <button type="button" className="h-8 px-2.5 text-sm text-ink-2 underline underline-offset-2 hover:text-ink-1">
            Advanced filters
          </button>
        }
        right={<Button variant="secondary" className="!h-10">Columns</Button>}
      />
      <SummaryStrip label="Summary for this view">
        <Figure label="Donors in this view" value={42} source="Assigned to you, as of now" />
        <Figure label="Given this year" value="$186,400" source="From these 42 donors, Jan 1 to now" />
        <Figure label="Next steps overdue" value={5} compare="Oldest is 12 days late" compareTone="danger" source="From next steps on these donors" />
        <Figure label="Thank-yous owed" value={3} source="From the thank-you queue, as of now" href="#" />
      </SummaryStrip>
    </div>
  );
}

// ── Composed sample 2: Donor.dc.html header, next step, summary ─────────
function DonorTop({ onRecordGift }: { onRecordGift: () => void }) {
  return (
    <div className="bg-app border border-hairline rounded-modal p-4 sm:p-6">
      <PageHeader
        title="Dana Whitfield"
        breadcrumb={[{ label: "Donors & Funders", href: "#" }]}
        chips={
          <>
            <IdentityChip>Person</IdentityChip>
            <IdentityChip>Major donor</IdentityChip>
            <IdentityChip initials="MO">Owner: Maya</IdentityChip>
            <span className={`${TYPE.bodyMuted} text-[13px] pl-1`}>Donor since 2019</span>
          </>
        }
        secondaryActions={<Button variant="secondary" size="lg">Log a conversation</Button>}
        moreActions={MORE}
        primaryAction={
          <Button size="lg" onClick={onRecordGift}>
            Record a gift
          </Button>
        }
      />
      <NextStepBar
        title="Send year-end ask."
        due={{ text: "12 days late.", late: true }}
        meta="Was due Nov 9. Owner: Maya. For the Year-end ask, $25,000. Set after coffee on Nov 6."
        actions={[
          <Button key="d" variant="strong" className="!h-10">Mark done</Button>,
          <Button key="r" variant="secondary" className="!h-10">Reschedule</Button>,
          <Button key="c" variant="secondary" className="!h-10">Change</Button>,
        ]}
      />
      <SummaryStrip label="Giving summary">
        <Figure label="Lifetime giving" value="$48,000" source="From 9 gifts since 2019, as of now" />
        <Figure label="Last gift" value="$10,000" source="Oct 3 by check. Thanked Oct 5" />
        <Figure label="Given this year" value="$15,000" compare="vs $12,000 last year" source="2 gifts, Jan 1 to today" />
        <Figure label="Open asks" value="$25,000" source="1 ask. From Pipeline, as of now" />
      </SummaryStrip>
    </div>
  );
}

// ── Composed sample 3: the GiftFlow.dc.html drawer ──────────────────────
function GiftDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState("Check");
  const [send, setSend] = useState("email");
  const [saving, setSaving] = useState(false);
  const methods = ["Check", "Card", "Bank", "Stock", "Other"];
  const sendOptions = [
    { key: "email", title: "Email now", hint: "To dana.whitfield@example.com. Matches her preference." },
    { key: "queue", title: "Add to my thank-you queue", hint: "Send later with the 3 already waiting." },
    { key: "print", title: "Print letter", hint: "Opens a letter and receipt ready to print and sign." },
  ];
  const fakeSave = () => {
    // Money write: no optimistic update. Show the saving state, then confirm.
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      onClose();
      toast.success("Sample only. Nothing was saved.");
    }, 700);
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Record a gift"
      description="From Dana Whitfield. Only amount and date are required."
      footer={
        <>
          <Button variant="secondary" size="lg" disabled={saving}>
            Save gift only
          </Button>
          <Button size="lg" loading={saving} onClick={fakeSave}>
            {saving ? "Saving" : "Save gift and send thank-you"}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Amount" required inputMode="decimal" defaultValue="25,000" data-autofocus />
          <DateField label="Date" required defaultValue="2026-11-21" hint="Today, Pacific time" />
        </div>
        <SelectField
          label="Fund or campaign"
          hint="Filled in from the Year-end ask"
          options={[
            { value: "ye", label: "General fund, Year-end appeal 2026" },
            { value: "si", label: "Summer introships" },
            { value: "ac", label: "Ambition Coach" },
          ]}
        />
        <div role="radiogroup" aria-labelledby="kit-method" className="flex flex-col gap-1.5">
          <span id="kit-method" className={TYPE.fieldLabel}>
            Payment method
          </span>
          <div className="grid grid-cols-5 border border-outline rounded-control overflow-hidden">
            {methods.map((m, i) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`h-10 text-sm ${i > 0 ? "border-l border-hairline" : ""} ${
                  method === m ? "bg-ink-1 text-surface font-semibold" : "bg-surface text-ink-1 hover:bg-tile"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className={TYPE.metadata}>Check, like her last gift</span>
        </div>
        <div className="p-3 border border-outline rounded-control">
          <CheckboxField
            label="Counts toward the Year-end ask, $25,000"
            hint="This gift meets the ask in full. It moves to Won in Pipeline."
            defaultChecked
          />
        </div>
        <TextareaField label="Note" hint="Optional. Shows on her timeline." rows={2} />

        <div className="border-t border-hairline pt-4 flex items-baseline justify-between gap-3">
          <h3 className={TYPE.subsectionTitle}>Thank-you</h3>
          <span className={`${TYPE.bodyMuted} text-[13px]`}>Template: Major gift thanks</span>
        </div>
        <Notice tone="info" title="Drafted by AI from your template.">
          Review before sending.
        </Notice>
        <div className="rounded-control border border-outline bg-tile px-4 py-3 text-sm">
          <div className={TYPE.metadata}>Subject: Thank you, Dana</div>
          <p className="mt-2">Dear Dana,</p>
          <p className="mt-2">
            Thank you for your gift of $25,000. This one goes to summer introships, so more teens get a first real look
            at a career next summer.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className={`${TYPE.fieldLabel} pb-1`}>How to send it</legend>
          {sendOptions.map((o) => (
            <label
              key={o.key}
              className={`flex items-start gap-3 p-3 rounded-control cursor-pointer ${
                send === o.key ? "border-2 border-ink-1" : "border border-outline"
              }`}
            >
              <input
                type="radio"
                name="kit-send"
                checked={send === o.key}
                onChange={() => setSend(o.key)}
                className="mt-0.5 w-4 h-4 accent-[color:var(--text-primary)]"
              />
              <span>
                <span className="block font-semibold text-sm">{o.title}</span>
                <span className={`block ${TYPE.bodyMuted} text-[13px]`}>{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </form>
    </Drawer>
  );
}

export default function KitGallery({ initialDrawer }: { initialDrawer: "gift" | null }) {
  const toast = useToast();
  const [drawer, setDrawer] = useState<"gift" | "plain" | null>(initialDrawer);
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState("mine");
  const [tf, setTf] = useState("all");

  return (
    <>
      <PageHeader
        title="UI kit"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }]}
        subtitle="Every shared BloomOS component in every state, with made-up data. Owner and admin only. Nothing on this page saves."
        moreActions={[
          { label: "Jump to Main sample", href: "#sample-main" },
          { label: "Jump to Donor sample", href: "#sample-donor" },
          { label: "Open the gift drawer", onSelect: () => setDrawer("gift") },
        ]}
        primaryAction={
          <Button size="lg" onClick={() => setDrawer("gift")}>
            Open the gift drawer
          </Button>
        }
      />

      <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-8">
        {[
          ["sample-main", "Main sample"],
          ["sample-donor", "Donor sample"],
          ["buttons", "Button"],
          ["fields", "Fields"],
          ["overlays", "Drawer and Modal"],
          ["header", "PageHeader"],
          ["filters", "FilterRow and SavedViews"],
          ["figures", "Figure"],
          ["nextstep", "NextStepBar"],
          ["timeline", "Timeline"],
          ["empty", "EmptyState"],
          ["notice", "Notice"],
          ["skeleton", "Skeletons"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-ink-2 underline underline-offset-2 hover:text-ink-1">
            {label}
          </a>
        ))}
      </nav>

      <Section id="sample-main" title="Sample: a list page top" note="Main.dc.html: header with one primary action and More actions, saved views with mine first, the filter row, the summary strip.">
        <MainTop />
      </Section>

      <Section id="sample-donor" title="Sample: a record top" note="Donor.dc.html: breadcrumb, identity chips, next-step bar, summary strip. Record a gift opens the GiftFlow drawer.">
        <DonorTop onRecordGift={() => setDrawer("gift")} />
      </Section>

      <Section id="buttons" title="Button" note="Primary is the one action per screen. Strong leads inside a panel when the page already has its primary. md is 36px, lg is 44px.">
        <Panel className="grid gap-6">
          {(["md", "lg"] as const).map((size) => (
            <Specimen key={size} label={`Size ${size}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Button size={size}>Primary</Button>
                <Button size={size} variant="secondary">Secondary</Button>
                <Button size={size} variant="quiet">Quiet</Button>
                <Button size={size} variant="danger">Delete</Button>
                <Button size={size} variant="strong">Strong</Button>
                <Button size={size} disabled>Disabled</Button>
                <Button size={size} loading>Saving</Button>
                <Button size={size} variant="secondary" loading>Loading</Button>
                <Button size={size} variant="secondary" iconOnly aria-label="Add a donor">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d={ICONS.plus} />
                  </svg>
                </Button>
                <Button size={size} variant="secondary" href="#buttons">
                  Link button
                </Button>
              </div>
            </Specimen>
          ))}
        </Panel>
      </Section>

      <Section id="fields" title="Fields" note="Label, optional hint, error line, required marker. Hint and error are linked to the control for screen readers.">
        <Panel className="grid gap-5 sm:grid-cols-2">
          <TextField label="Donor name" placeholder="Dana Whitfield" />
          <TextField label="Email" required hint="Thank-yous go here." type="email" defaultValue="dana.whitfield@example.com" />
          <TextField label="Amount" required error="Enter an amount above zero." defaultValue="0" inputMode="decimal" />
          <TextField label="Phone" disabled defaultValue="(510) 555-0142" hint="Synced from HubSpot. Edit it there." />
          <SelectField
            label="Fund"
            placeholder="Choose a fund"
            options={[
              { value: "general", label: "General fund" },
              { value: "intro", label: "Summer introships" },
            ]}
          />
          <SelectField label="Owner" error="Pick who owns this donor." placeholder="Choose a person" options={[{ value: "mo", label: "Maya" }]} />
          <DateField label="Gift date" required hint="Today, Pacific time" />
          <DateField label="Follow up by" error="Pick a date after today." />
          <TextareaField label="Note" hint="Shows on the donor timeline." placeholder="Met at the Fall kickoff." />
          <TextareaField label="Reason" required error="Say why this gift is being changed." />
          <CheckboxField label="Prefers email" hint="Thank by email. Do not call." defaultChecked />
          <CheckboxField label="I confirmed this with the donor" required error="Confirm before saving." />
          <TextField label="Dense field (md, 36px)" controlSize="md" placeholder="For toolbars and dense forms" />
        </Panel>
      </Section>

      <Section id="overlays" title="Drawer and Modal" note="Both share one focus trap: focus moves in, Tab stays inside, Escape and the scrim close, focus returns. Under 640px both become bottom sheets.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDrawer("gift")}>Open the gift drawer</Button>
          <Button variant="secondary" onClick={() => setDrawer("plain")}>Open a short drawer</Button>
          <Button variant="secondary" onClick={() => setModal(true)}>Open a modal</Button>
        </div>
      </Section>

      <Section id="header" title="PageHeader" note="V1 (title, subtitle, actions) keeps working for the 88 existing pages. V2 adds breadcrumb, chips, one primary action, secondary actions and More actions.">
        <div className="grid gap-4">
          <Panel>
            <Specimen label="V1, unchanged">
              <PageHeader
                title="Tasks"
                subtitle="Everything the team is working on this week."
                actions={<Button variant="secondary">New task</Button>}
              />
            </Specimen>
          </Panel>
          <Panel>
            <Specimen label="V2, list page">
              <PageHeader title="Pipeline" primaryAction={<Button size="lg">Add an ask</Button>} moreActions={MORE} />
            </Specimen>
          </Panel>
          <Panel>
            <Specimen label="V2, detail page">
              <PageHeader
                title="Harlow Family Fund"
                breadcrumb={[{ label: "Donors & Funders", href: "#" }]}
                chips={
                  <>
                    <IdentityChip>Foundation</IdentityChip>
                    <IdentityChip initials="MO">Owner: Maya</IdentityChip>
                  </>
                }
                secondaryActions={<Button variant="secondary" size="lg">Log a conversation</Button>}
                moreActions={MORE}
                primaryAction={<Button size="lg">Record a gift</Button>}
              />
            </Specimen>
          </Panel>
        </div>
      </Section>

      <Section id="filters" title="FilterRow and SavedViews" note="Press / anywhere to jump to search. Accent only on active filters.">
        <div className="grid gap-4">
          <Panel>
            <Specimen label="Saved views (tablist, mine first: My donors was listed third)">
              <SavedViews views={DONOR_VIEWS} activeKey={view} onSelect={setView} saveSlot={<SaveViewButton />} />
            </Specimen>
            <Specimen label="Saved views (links)">
              <SavedViews
                views={[
                  { key: "mine", label: "My asks", mine: true, href: "#filters", count: 7 },
                  { key: "all", label: "All asks", href: "#filters", count: 31 },
                ]}
                activeKey="mine"
              />
            </Specimen>
          </Panel>
          <Panel>
            <Specimen label="Nothing active">
              <FilterRow
                search={{ value: q, onChange: setQ, label: "Search tasks" }}
                filters={{ count: 0, onClick: () => undefined }}
                sort={{ label: "Sort: due date", onClick: () => undefined }}
                quickFilters={[
                  { key: "mine", label: "Mine" },
                  { key: "status", label: "Status", hasMenu: true },
                ]}
                onClearAll={() => setQ("")}
              />
            </Specimen>
            <Specimen label="Off until there is data">
              <FilterRow
                disabled
                disabledNote="Search, filters and saved views turn on once you have donors."
                search={{ value: "", onChange: () => undefined, label: "Search donors" }}
                filters={{ count: 0, onClick: () => undefined }}
                sort={{ label: "Sort: next step due", onClick: () => undefined }}
              />
            </Specimen>
          </Panel>
        </div>
      </Section>

      <Section id="figures" title="Figure, SummaryStrip and StatCard" note="Every figure has a source line. Missing reads No data yet, never 0. Stale says so and offers Refresh.">
        <div className="grid gap-4">
          <SummaryStrip label="Figure states">
            <Figure label="Fresh" value="$412,600" compare="Down $28,400 since Oct 20" source="From bank balance alert, today 6:02am" />
            <Figure label="Zero is a number" value={0} source="0 gifts recorded this week, as of now" />
            <Figure label="Missing" value={null} source="Connect your bank to see cash on hand" />
            <Figure label="Stale" value="$590,900" freshness="stale" source="Last updated 9 days ago." onRefresh={() => toast.info("Sample only.")} />
            <Figure label="Partial" value="$3,410" freshness="partial" source="14 transactions still need a category" />
          </SummaryStrip>
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            <Figure layout="card" label="Card layout" value="7.4 months" source="Cash divided by 3-month average spend" />
            <StatCard label="StatCard with source" value="$612,400" delta={{ text: "$22,400 ahead", direction: "up" }} source="From recorded gifts, Jan 1 to now" />
            <StatCard label="StatCard, missing" value={null} source="No gifts imported yet" />
            <StatCard label="StatCard, legacy (no source)" value="18" sub="deprecated: pass source" />
          </div>
        </div>
      </Section>

      <Section id="nextstep" title="NextStepBar" note="Late steps say how late, in words and in danger text. Up to three actions; the lead one is strong.">
        <div className="grid gap-2">
          <NextStepBar
            title="Send year-end ask."
            due={{ text: "12 days late.", late: true }}
            meta="Was due Nov 9. Owner: Maya."
            actions={[
              <Button key="d" variant="strong" className="!h-10">Mark done</Button>,
              <Button key="r" variant="secondary" className="!h-10">Reschedule</Button>,
            ]}
          />
          <NextStepBar
            title="Invite to site visit."
            due={{ text: "Due Nov 24." }}
            meta="Owner: Maya. For Priya Raman."
            actions={[<Button key="d" variant="strong" className="!h-10">Mark done</Button>]}
          />
          <NextStepBar title={null} meta="Every donor should have one." actions={[<Button key="a" variant="strong" className="!h-10">Add a next step</Button>]} />
        </div>
      </Section>

      <Section id="timeline" title="Timeline" note="Typed entries with an icon, title, chips, meta, actions and a right-aligned date. Filter chips count by kind.">
        <Timeline
          entries={ENTRIES}
          filters={TIMELINE_FILTERS}
          activeFilter={tf}
          onFilterChange={setTf}
          composer={
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <label className="flex-1 min-w-0">
                <span className="sr-only">Add a note</span>
                <input
                  type="text"
                  placeholder="Add a note about Dana"
                  className="w-full h-10 px-3 rounded-control bg-tile border border-outline text-sm placeholder:text-ink-3 focus:outline-none focus:border-orange"
                />
              </label>
              <Button variant="secondary" className="!h-10">Save note</Button>
            </form>
          }
          footer={
            <>
              <span className={TYPE.bodyMuted}>Showing 5 of 31 since 2019</span>
              <Button variant="secondary">Show older</Button>
            </>
          }
        />
      </Section>

      <Section id="empty" title="EmptyState" note="V2: what this place is for, one primary and one secondary action, and what happens next. V1 stays for small panels.">
        <div className="grid gap-4">
          <Panel className="!p-0">
            <EmptyState
              label="donors"
              title="Your donors and funders will live here"
              icon={<Icon d={ICONS.people} />}
              purpose="One list of everyone who gives: people, households, foundations and companies, with what they gave and what to do next."
              primaryAction={<Button size="lg">Import a spreadsheet</Button>}
              primaryHint="CSV or Excel, up to 2,000 rows."
              secondaryAction={<Button size="lg" variant="secondary">Add one donor</Button>}
              secondaryHint="Type in one person, household, foundation or company."
              next="you match your columns to ours, we flag possible duplicates, and you see a preview. Nothing is saved until you confirm."
              footer={<a href="#empty">Back to your setup checklist (1 of 5 done)</a>}
            />
          </Panel>
          <EmptyState label="Documents" hint="Upload a proposal or a pledge letter to keep it with this donor." action={<Button variant="secondary">Upload a document</Button>} />
        </div>
      </Section>

      <Section id="notice" title="Notice" note="Inline messages. Each tone has its own glyph and a spoken label, so status is never color alone.">
        <div className="grid gap-2">
          <Notice tone="info" title="Gmail is connected.">Thank-yous send from maya@example.org.</Notice>
          <Notice tone="success" title="Import finished.">212 donors added, 4 duplicates skipped.</Notice>
          <Notice tone="warning" title="3 thank-yous are owed." action={<Button variant="secondary">Open the queue</Button>}>
            The oldest gift came in 6 days ago.
          </Notice>
          <Notice tone="danger" title="The bank feed stopped.">No transactions since Nov 14. Reconnect to keep cash current.</Notice>
          <Notice tone="partial" title="14 transactions need a category." action={<Button variant="secondary">Reconcile</Button>}>
            Until they have one, $3,410 of spending is left out of the budget below.
          </Notice>
          <Notice tone="stale" title="These figures are 9 days old." action={<Button variant="secondary">Refresh</Button>}>
            The last bank alert arrived Nov 12.
          </Notice>
          <Panel className="!p-0">
            <div className="px-5 py-4">
              <h3 className={TYPE.subsectionTitle}>Budget</h3>
            </div>
            <Notice inline tone="partial" title="14 transactions need a category." action={<Button variant="secondary">Reconcile</Button>}>
              Inline inside a panel.
            </Notice>
          </Panel>
        </div>
      </Section>

      <Section id="skeleton" title="Skeletons" note="Each has the silhouette of the block it stands in for.">
        <SkeletonGroup>
          <SkeletonHeader breadcrumb chips />
          <SkeletonStrip count={4} />
          <div className="grid gap-4 lg:grid-cols-2">
            <SkeletonTable rows={4} />
            <SkeletonTimeline rows={3} />
          </div>
        </SkeletonGroup>
      </Section>

      <GiftDrawer open={drawer === "gift"} onClose={() => setDrawer(null)} />
      <Drawer
        open={drawer === "plain"}
        onClose={() => setDrawer(null)}
        title="Reschedule"
        description="Move the next step for Dana Whitfield."
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setDrawer(null)}>
              Cancel
            </Button>
            <Button size="lg" onClick={() => setDrawer(null)}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <DateField label="New due date" required />
          <TextareaField label="Why" hint="Optional. Shows on her timeline." rows={3} />
        </div>
      </Drawer>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Archive Elena Brandt?"
        description="She leaves your lists. Her gifts stay in your totals."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Keep
            </Button>
            <Button variant="danger" onClick={() => setModal(false)}>
              Archive
            </Button>
          </>
        }
      >
        <p className={TYPE.body}>You can bring her back from Settings, Imports at any time.</p>
      </Modal>
    </>
  );
}
