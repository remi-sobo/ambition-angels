"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import { TYPE } from "@/lib/admin/typeScale";
import { bankVerdict, splitBank, type BankStory } from "@/lib/comms/bank";
import type { LoadedStory } from "@/lib/comms/stories-server";
import CaptureSheet from "./CaptureSheet";
import { ConsentChip, StoryStatusChip, SubjectChip, TagChip } from "./StoryChips";

/**
 * The story bank (spec §7.2). The list IS the product: one calm column, the
 * verdict first, healthy receding and problems advancing.
 *
 * Ranking is a drag. Ranked cards sit above a hairline in the order someone
 * put them in; everything else falls below it ordered by the deterministic
 * suggestion score, visually subordinate. That subordination is deliberate —
 * if the computed rank looks authoritative, people stop curating and the bank
 * becomes a feed.
 */

function why(s: LoadedStory): string {
  const bits: string[] = [];
  if (s.happened_on) {
    const days = Math.round((Date.now() - Date.parse(`${s.happened_on}T00:00:00Z`)) / 86_400_000);
    if (days <= 30) bits.push("fresh");
  }
  if (s.status !== "used") bits.push("unused");
  if (s.strategic_goal_id) bits.push("on goal");
  if (s.media.length > 0) bits.push("has a photo");
  if (s.publishable) bits.push("ready now");
  return bits.length ? `Suggested: ${bits.join(", ")}.` : "Suggested.";
}

function StoryCard({
  story,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
  hint,
}: {
  story: LoadedStory;
  draggable: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  dragging?: boolean;
  /** The quiet "why is this suggested" hover, below the hairline. */
  hint?: string;
}) {
  const blocked = !story.publishable && story.blocked_reason !== null;
  return (
    <li
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={hint}
      className={`rounded-card-lg border border-hairline bg-surface transition-opacity ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <Link
        href={`/admin/comms/stories/${story.id}`}
        className="flex gap-3 p-4 hover:bg-tile/60 rounded-card-lg"
      >
        {draggable && (
          <span
            aria-hidden
            className="shrink-0 self-start mt-1 text-ink-3 cursor-grab select-none leading-none"
            title="Drag to reorder"
          >
            ⋮⋮
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className={`${TYPE.cardTitle} truncate`}>{story.title}</div>
          {story.body && (
            <p className="mt-1 text-sm text-ink-2 line-clamp-2 leading-relaxed">{story.body}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StoryStatusChip status={story.status} />
            <ConsentChip state={story.consent_state} />
            {story.subjects.map((s) => (
              <SubjectChip key={s.id} label={s.display_label} redacted={s.redacted} />
            ))}
            {story.tags.map((t) => (
              <TagChip key={t} tag={t} />
            ))}
          </div>
          {blocked && (
            <p className="mt-2 text-[11px] text-ink-3">
              <span className="font-semibold">Blocked from use.</span> {story.blocked_reason}
            </p>
          )}
        </div>
        {story.media.length > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/admin/comms/media/${story.media[0].id}/url`}
            alt=""
            className="shrink-0 w-14 h-14 rounded-card object-cover border border-hairline bg-tile"
          />
        )}
      </Link>
    </li>
  );
}

export default function StoryBank({ stories }: { stories: LoadedStory[] }) {
  const router = useRouter();
  const [capturing, setCapturing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const { ranked, suggested } = useMemo(() => {
    const split = splitBank(stories as unknown as BankStory[]);
    const byId = new Map(stories.map((s) => [s.id, s]));
    let rankedList = split.ranked.map((s) => byId.get(s.id)!).filter(Boolean);
    // While a drag is in flight, honour the optimistic order so the card
    // follows the cursor instead of snapping back until the write lands.
    if (order) {
      const inOrder = order.map((id) => byId.get(id)!).filter(Boolean);
      rankedList = inOrder;
    }
    return {
      ranked: rankedList,
      suggested: split.suggested
        .map((s) => byId.get(s.id)!)
        .filter((s) => s && !order?.includes(s.id)),
    };
  }, [stories, order]);

  const verdict = useMemo(
    () => bankVerdict(stories as unknown as BankStory[]),
    [stories],
  );

  async function persist(ids: string[]) {
    setSaving(true);
    try {
      // One single-row update per card. At this team size the "two people drag
      // at once, last write wins" race is documented and accepted rather than
      // engineered around (spec §10).
      await Promise.all(
        ids.map((id, i) =>
          fetch(`/api/admin/comms/stories/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rank_order: i + 1 }),
          }),
        ),
      );
      router.refresh();
    } finally {
      setSaving(false);
      setOrder(null);
    }
  }

  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const current = (order ?? ranked.map((s) => s.id)).slice();
    // Dragging an unranked card onto the ranked list adopts it.
    if (!current.includes(dragId)) current.push(dragId);
    const from = current.indexOf(dragId);
    const to = current.indexOf(targetId);
    if (from === -1 || to === -1) return;
    current.splice(to, 0, ...current.splice(from, 1));
    setOrder(current);
    void persist(current);
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Verdict first: one sentence, worst true thing, then the list. */}
        <p className="text-sm text-ink-1 max-w-2xl leading-relaxed">{verdict}</p>
        <Button onClick={() => setCapturing(true)}>+ Capture a win</Button>
      </div>

      {stories.length === 0 ? (
        <div className="mt-6 rounded-card-lg border border-hairline bg-surface p-8 text-center">
          <p className={TYPE.sectionTitle}>Wins evaporate.</p>
          <p className="mt-1 text-sm text-ink-2">
            They live in camera rolls and staff memory until someone writes one down.
          </p>
          <div className="mt-4">
            <Button onClick={() => setCapturing(true)}>+ Capture a win</Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {ranked.length > 0 && (
            <ul className="space-y-2">
              {ranked.map((s) => (
                <StoryCard
                  key={s.id}
                  story={s}
                  draggable
                  dragging={dragId === s.id}
                  onDragStart={() => setDragId(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    reorder(s.id);
                    setDragId(null);
                  }}
                />
              ))}
            </ul>
          )}

          {suggested.length > 0 && (
            <>
              <div
                className="flex items-center gap-3 pt-4 pb-1"
                onDragOver={(e) => e.preventDefault()}
              >
                <span className={TYPE.sectionHeader}>Suggested</span>
                <span className="h-px flex-1 bg-hairline" />
                {saving && <span className="text-[11px] text-ink-3">Saved</span>}
              </div>
              <ul className="space-y-2">
                {suggested.map((s) => (
                  <StoryCard
                    key={s.id}
                    story={s}
                    draggable
                    hint={why(s)}
                    dragging={dragId === s.id}
                    onDragStart={() => setDragId(s.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      reorder(s.id);
                      setDragId(null);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <CaptureSheet open={capturing} onClose={() => setCapturing(false)} />
    </>
  );
}
