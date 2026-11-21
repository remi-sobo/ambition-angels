"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "../../_components/ui/Button";
import Badge from "../../_components/ui/Badge";
import Drawer from "../../_components/ui/Drawer";
import { TextField, TextareaField, CheckboxField, DateField, SelectField } from "../../_components/ui/Field";
import { useSaveAction } from "../../_lib/useSaveAction";
import { CONSENT_SCOPES, consentState, type ConsentRow, type ConsentScope } from "@/lib/comms/consent";
import type { StorySubjectView } from "@/lib/comms/stories";
import { TYPE } from "@/lib/admin/typeScale";

const SCOPE_LABEL: Record<ConsentScope, string> = {
  first_name: "First name",
  full_name: "Full name",
  photo: "Photo",
  video: "Video",
  quote: "Quote",
  outcome_details: "Outcome details",
};

const STATE_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  current: { label: "Consent on file", tone: "success" },
  expiring: { label: "Consent expiring soon", tone: "warning" },
  pending: { label: "Consent requested", tone: "warning" },
  expired: { label: "Consent expired", tone: "danger" },
  revoked: { label: "Consent revoked", tone: "danger" },
  none: { label: "No consent on file", tone: "warning" },
};

const today = () => new Date().toISOString().slice(0, 10);

/** Approve, send back to raw, or retire a story. Approval is the human gate;
 *  it does not lift a consent hold. */
export function StatusButton({ storyId, to, label, variant = "secondary" }: { storyId: string; to: string; label: string; variant?: "primary" | "secondary" | "quiet" }) {
  const save = useSaveAction();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await save({ request: { url: `/api/admin/comms/stories/${storyId}`, method: "PATCH", body: { status: to } }, success: to === "approved" ? "Approved." : "Saved." });
        setBusy(false);
        if (r.ok) router.refresh();
      }}
    >
      {label}
    </Button>
  );
}

/** Edit the words of a story in a drawer. */
export function EditStoryButton({ story }: { story: { id: string; title: string; body: string | null; outcome: string | null } }) {
  const save = useSaveAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [body, setBody] = useState(story.body ?? "");
  const [outcome, setOutcome] = useState(story.outcome ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Edit story"
        footer={
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await save({ request: { url: `/api/admin/comms/stories/${story.id}`, method: "PATCH", body: { title, body, outcome } }, success: "Saved." });
              setBusy(false);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              }
            }}
          >
            Save
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextareaField label="What happened" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <TextareaField label="What changed because of it" hint="Outcome, not output. The part a donor remembers." rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </div>
      </Drawer>
    </>
  );
}

/**
 * One person in a story and their consent. Recording consent for a
 * participant needs comms.subjects.read (owner/admin); others see why.
 */
export function SubjectConsent({ subject, canManage }: { subject: StorySubjectView; canManage: boolean }) {
  const save = useSaveAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [grantedBy, setGrantedBy] = useState("");
  const [grantedAt, setGrantedAt] = useState(today());
  const [expiresAt, setExpiresAt] = useState("");
  const [scope, setScope] = useState<ConsentScope[]>(["first_name", "quote", "outcome_details"]);
  const [busy, setBusy] = useState(false);
  const st = STATE_LABEL[subject.consent_state] ?? STATE_LABEL.none;
  const isNone = subject.subject_type === "none";

  const post = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    const r = await save({ request: { url: `/api/admin/comms/subjects/${subject.id}/consents`, method: "POST", body }, success });
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    }
  };
  const revoke = async (id: string) => {
    const r = await save({ request: { url: `/api/admin/comms/consents/${id}`, method: "PATCH", body: { revoke: true } }, success: "Consent revoked. The story is held everywhere." });
    if (r.ok) router.refresh();
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`${TYPE.body} font-semibold`}>{isNone ? "No one identifiable" : subject.display_label}</p>
          <p className={TYPE.metadata}>
            {isNone ? "Recorded at capture: no names, faces or details that point to one person." : subject.subject_type === "participant" ? `Participant${subject.is_minor ? ", treated as a minor" : ""}` : subject.subject_type}
          </p>
        </div>
        {!isNone && <Badge tone={st.tone}>{st.label}</Badge>}
      </div>

      {!isNone && (subject.consents ?? []).length > 0 && (
        <ul className="mt-2 space-y-1">
          {(subject.consents as Array<ConsentRow & { id?: string; granted_by?: string | null }>).map((c, i) => {
            const s = consentState(c);
            return (
              <li key={c.id ?? i} className={`${TYPE.metadata} flex flex-wrap items-center justify-between gap-2`}>
                <span>
                  {c.granted_at ? `Granted ${c.granted_at}${c.granted_by ? ` by ${c.granted_by}` : ""}` : `Requested ${c.requested_at}`}
                  {c.expires_at ? `, until ${c.expires_at}` : ""} · {(c.scope ?? []).map((x) => SCOPE_LABEL[x as ConsentScope] ?? x).join(", ")}
                  {s === "revoked" ? " · revoked" : ""}
                </span>
                {canManage && c.id && s !== "revoked" && (
                  <Button variant="quiet" size="sm" onClick={() => void revoke(c.id as string)}>Revoke</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isNone && (
        canManage ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Record consent</Button>
            {subject.consent_state === "none" && (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void post({ scope: ["first_name", "quote"], requested_at: today() }, "Recorded that you asked. It stays held until consent is granted.")}>
                Mark consent requested
              </Button>
            )}
          </div>
        ) : (
          <p className={`${TYPE.metadata} mt-2`}>Only an owner or admin can record consent for a participant.</p>
        )
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Record consent"
        description="From the signed release or the guardian's written reply. Keep the evidence in Documents."
        footer={
          <Button variant="primary" loading={busy} onClick={() => void post({ scope, granted_at: grantedAt, granted_by: grantedBy, expires_at: expiresAt || null }, "Consent recorded.")}>
            Save consent
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Who gave permission?" required hint="A parent or guardian for anyone under 18." value={grantedBy} onChange={(e) => setGrantedBy(e.target.value)} />
          <DateField label="Granted on" required value={grantedAt} onChange={(e) => setGrantedAt(e.target.value)} />
          <DateField label="Good until" hint="Optional. Leave empty for no end date." value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          <fieldset className="flex flex-col gap-2">
            <legend className={`${TYPE.fieldLabel} mb-1`}>What it covers</legend>
            {CONSENT_SCOPES.map((s) => (
              <CheckboxField
                key={s}
                label={SCOPE_LABEL[s]}
                checked={scope.includes(s)}
                onChange={(e) => setScope((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))}
              />
            ))}
          </fieldset>
        </div>
      </Drawer>
    </li>
  );
}

/** Add someone to a story. A participant needs comms.subjects.read. */
export function AddSubjectButton({ storyId, canAddParticipant }: { storyId: string; canAddParticipant: boolean }) {
  const save = useSaveAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(canAddParticipant ? "participant" : "constituent");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const options = [
    ...(canAddParticipant ? [{ value: "participant", label: "A participant" }] : []),
    { value: "constituent", label: "A donor or supporter" },
    { value: "partner", label: "A partner" },
    { value: "staff", label: "Staff" },
  ];
  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>+ Add someone</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Add someone to this story"
        footer={
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await save({ request: { url: `/api/admin/comms/stories/${storyId}/subjects`, method: "POST", body: { subject_type: type, display_label: label } }, success: "Added. The story is held until their consent is on file." });
              setBusy(false);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              }
            }}
          >
            Add
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <SelectField label="Who" options={options} value={type} onChange={(e) => setType(e.target.value)} />
          <TextField label="Name" hint={type === "participant" ? "Shown as first name and last initial only." : undefined} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
      </Drawer>
    </>
  );
}

/**
 * "Stop using this story" for anyone who can manage Comms, staff included.
 * Revokes every live participant consent on the story without showing who
 * is in it. Two steps, so it is never one stray tap.
 */
export function StopUsingStoryButton({ storyId }: { storyId: string }) {
  const save = useSaveAction();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <Button variant="quiet" onClick={() => setConfirming(true)}>
        Stop using this story
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <p className={TYPE.metadata}>
        This revokes consent for everyone in this story. It is held everywhere at once, including emails already queued. Only an owner or admin can record consent again.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await save({
              request: { url: `/api/admin/comms/stories/${storyId}/stop-using`, method: "POST", body: {} },
              success: "Consent revoked. The story is held everywhere.",
            });
            setBusy(false);
            if (r.ok) {
              setConfirming(false);
              router.refresh();
            }
          }}
        >
          Revoke consent
        </Button>
        <Button variant="quiet" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
