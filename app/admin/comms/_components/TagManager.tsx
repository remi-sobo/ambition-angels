"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button, { ButtonLink } from "../../_components/ui/Button";
import Card from "../../_components/ui/Card";
import Badge from "../../_components/ui/Badge";
import Notice from "../../_components/ui/Notice";
import { TextField, TextareaField } from "../../_components/ui/Field";
import { useSaveAction } from "../../_lib/useSaveAction";
import { useConfirm } from "../../_components/feedback/ConfirmProvider";
import { useToast } from "../../_components/feedback/ToastProvider";
import { TYPE } from "@/lib/admin/typeScale";
import { normalizeTag, isSystemTag } from "@/lib/comms/tags";

/**
 * The tag library. Three parts: what BloomOS keeps current by itself, your
 * own tags (rename, merge, delete, make a list), and a box to tag a group of
 * people at once by pasting their email addresses.
 */

export type TagOverview = {
  tags: Array<{ tag: string; count: number }>;
  automatic: Array<{ key: string; label: string; how: string; start: string; count: number }>;
  people: number;
};

const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

export default function TagManager({ overview, canWrite }: { overview: TagOverview; canWrite: boolean }) {
  const router = useRouter();
  const save = useSaveAction();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState("");

  // Tag a group.
  const [tag, setTag] = useState("");
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<{ tag: string; people: number; changed: number; unmatched: string[] } | null>(null);

  const existing = (name: string) => overview.tags.find((t) => t.tag.toLowerCase() === name.toLowerCase()) ?? null;

  const rename = async (from: string) => {
    const to = normalizeTag(newName);
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    const into = existing(to);
    if (into && into.tag.toLowerCase() !== from.toLowerCase()) {
      const ok = await confirm({
        title: `Merge "${from}" into "${into.tag}"?`,
        body: `Everyone tagged "${from}" becomes "${into.tag}", and "${from}" goes away. This can't be undone in one step.`,
        confirmLabel: "Merge tags",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(from);
    const r = await save<{ changed: number; lists: number; lists_error: boolean }>({
      request: { url: "/api/admin/tags/rename", method: "POST", body: { from, to } },
    });
    setBusy("");
    if (r.ok) {
      const lists = r.data.lists ? ` ${r.data.lists} saved ${r.data.lists === 1 ? "list" : "lists"} updated to match.` : "";
      if (r.data.lists_error) toast.error(`The tag changed, but some saved lists still use "${from}". Open them and pick the new tag.`);
      else toast.success(`${into ? "Tags merged." : "Tag renamed."}${lists}`);
      setEditing(null);
      router.refresh();
    }
  };

  const remove = async (name: string, count: number) => {
    const ok = await confirm({
      title: `Delete the tag "${name}"?`,
      body: `It comes off ${people(count)}. The people stay; only the tag goes. A saved list that uses it will reach nobody by it until you change the list.`,
      confirmLabel: "Delete tag",
      destructive: true,
    });
    if (!ok) return;
    setBusy(name);
    const r = await save({ request: { url: "/api/admin/tags/rename", method: "POST", body: { from: name, to: null } }, success: "Tag deleted." });
    setBusy("");
    if (r.ok) router.refresh();
  };

  const tagGroup = async () => {
    const name = normalizeTag(tag);
    if (!name || !pasted.trim()) return;
    setBusy("group");
    setResult(null);
    const r = await save<{ people: number; changed: number; unmatched: string[] }>({
      request: { url: "/api/admin/tags", method: "POST", body: { add: [name], emails: pasted } },
    });
    setBusy("");
    if (!r.ok) return;
    setResult({ tag: name, ...r.data });
    setPasted("");
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-6 items-start">
      <div className="flex flex-col gap-4">
        <Card padded={false}>
          <div className="p-4 border-b border-hairline">
            <h2 className={TYPE.cardTitle}>Your tags</h2>
            <p className={`${TYPE.metadata} mt-1`}>
              What someone is to you that BloomOS can&rsquo;t work out by itself: Board, Volunteer, Gala host. A tag exists while someone carries it.
            </p>
          </div>
          {overview.tags.length === 0 ? (
            <p className={`p-4 ${TYPE.bodyMuted}`}>No tags yet. Tag a group of people on the right, or tag everyone on a list from the list builder.</p>
          ) : (
            <ul className="divide-y divide-hairline" aria-label="Your tags">
              {overview.tags.map((t) => (
                <li key={t.tag} className="flex flex-wrap items-center gap-3 px-4 py-2 min-h-[52px]">
                  {editing === t.tag ? (
                    <>
                      <TextField
                        label={`New name for ${t.tag}`}
                        controlSize="md"
                        className="flex-1 min-w-[12rem]"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void rename(t.tag);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        hint="Type the name of another tag to merge the two."
                        autoFocus
                      />
                      <Button size="sm" loading={busy === t.tag} disabled={!normalizeTag(newName)} onClick={() => void rename(t.tag)}>
                        Save
                      </Button>
                      <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <span className={`${TYPE.body} font-semibold break-words`}>{t.tag}</span>
                        <span className={`${TYPE.metadata} ml-2 [font-variant-numeric:tabular-nums]`}>{people(t.count)}</span>
                      </div>
                      <ButtonLink size="sm" href={`/admin/comms/lists/new?tag=${encodeURIComponent(t.tag)}`}>
                        Make a list
                      </ButtonLink>
                      {isSystemTag(t.tag) ? (
                        <span className={TYPE.metadata}>Set by the HubSpot sync</span>
                      ) : canWrite && (
                        <>
                          <Button
                            size="sm"
                            variant="quiet"
                            disabled={busy !== ""}
                            onClick={() => {
                              setEditing(t.tag);
                              setNewName(t.tag);
                            }}
                          >
                            Rename
                          </Button>
                          <Button size="sm" variant="quiet" loading={busy === t.tag} disabled={busy !== ""} onClick={() => void remove(t.tag, t.count)}>
                            Delete
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <div className="p-4 border-b border-hairline">
            <h2 className={TYPE.cardTitle}>Kept current by BloomOS</h2>
            <p className={`${TYPE.metadata} mt-1`}>
              Worked out from the gifts on record, so they are never out of date and never need tagging by hand. Out of {people(overview.people)}.
            </p>
          </div>
          <ul className="divide-y divide-hairline" aria-label="Automatic tags">
            {overview.automatic.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center gap-3 px-4 py-2 min-h-[52px]">
                <div className="min-w-0 flex-1">
                  <span className={`${TYPE.body} font-semibold`}>{a.label}</span>{" "}
                  <Badge tone="neutral">Automatic</Badge>
                  <div className={TYPE.metadata}>{a.how}</div>
                </div>
                <span className={`${TYPE.body} [font-variant-numeric:tabular-nums] whitespace-nowrap`}>{people(a.count)}</span>
                <ButtonLink size="sm" href={`/admin/comms/lists/new?start=${a.start}`}>
                  Make a list
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-4">
        <h2 className={`${TYPE.cardTitle} mb-1`}>Tag a group of people</h2>
        <p className={`${TYPE.metadata} mb-3`}>
          Paste their email addresses and name the tag. To tag everyone on a list instead, open the list and use &ldquo;Tag everyone on this list&rdquo;.
        </p>
        {canWrite ? (
          <div className="flex flex-col gap-3">
            <TextField label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. Board" maxLength={40} />
            {overview.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Use an existing tag">
                {overview.tags.slice(0, 12).map((t) => (
                  <Button key={t.tag} size="sm" variant={tag.toLowerCase() === t.tag.toLowerCase() ? "secondary" : "quiet"} onClick={() => setTag(t.tag)}>
                    {t.tag}
                  </Button>
                ))}
              </div>
            )}
            <TextareaField
              label="Email addresses"
              hint="From a spreadsheet column, an email's To line, anywhere. Only people already in BloomOS can be tagged."
              rows={7}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <div>
              <Button size="lg" loading={busy === "group"} disabled={!normalizeTag(tag) || !pasted.trim() || busy !== ""} onClick={() => void tagGroup()}>
                Tag these people
              </Button>
            </div>
            {result && (
              <Notice tone={result.unmatched.length ? "warning" : "success"} title={`${people(result.people)} now tagged "${result.tag}".`}>
                {result.changed < result.people ? `${people(result.people - result.changed)} already had it. ` : ""}
                {result.unmatched.length > 0 && (
                  <>
                    {result.unmatched.length === 1 ? "1 address is" : `${result.unmatched.length.toLocaleString("en-US")} addresses are`} not in BloomOS, so nothing was tagged for:{" "}
                    {result.unmatched.slice(0, 12).join(", ")}
                    {result.unmatched.length > 12 ? `, and ${result.unmatched.length - 12} more` : ""}.
                  </>
                )}
              </Notice>
            )}
          </div>
        ) : (
          <p className={TYPE.bodyMuted}>Your role can see tags but not change them.</p>
        )}
      </Card>
    </div>
  );
}
