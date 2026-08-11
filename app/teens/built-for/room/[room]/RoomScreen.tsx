"use client";

// The projected room screen (Phase 5). It fills with handles as students
// finish, and with tables once the host deals them. It NEVER shows a
// career — each student's assignment goes to their own device, because a
// wall that names the job kills every round in the room.

import { useCallback, useEffect, useState } from "react";

type RoomState = {
  roomCode: string;
  expired: boolean;
  joined: string[];
  tables: { n: number; handles: string[] }[] | null;
};

export default function RoomScreen({
  roomCode,
  hostToken,
}: {
  roomCode: string;
  hostToken: string | null;
}) {
  const [state, setState] = useState<RoomState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/ms/room/${encodeURIComponent(roomCode)}`, { cache: "no-store" });
      if (res.status === 404 || res.status === 400) {
        setNotFound(true);
        return;
      }
      if (res.ok) setState(await res.json());
    } catch {
      // transient; next poll retries
    }
  }, [roomCode]);

  useEffect(() => {
    void poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [poll]);

  const hostAction = useCallback(
    async (action: "assign" | "deliver") => {
      if (!hostToken || busy) return;
      setBusy(action);
      setNotice(null);
      try {
        const res = await fetch(`/api/ms/room/${encodeURIComponent(roomCode)}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host_token: hostToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotice(data.error ?? "Something went wrong");
        } else if (action === "deliver") {
          setNotice(`Sent. ${data.students} decks are in your inbox.`);
        }
        await poll();
      } catch {
        setNotice("Something went wrong");
      } finally {
        setBusy(null);
      }
    },
    [roomCode, hostToken, busy, poll]
  );

  if (notFound) {
    return (
      <div className="min-h-screen bg-ink text-cream flex items-center justify-center px-6">
        <p className="font-display text-4xl text-center">That room doesn&rsquo;t exist.</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        <p className="font-heading text-sm tracking-[0.35em] uppercase text-cream/50">
          ambitionangels.org/teens &middot; tap &ldquo;I have a room code&rdquo;
        </p>
        <h1 className="font-display text-[7rem] sm:text-[11rem] leading-none tracking-[0.15em] text-orange mt-2">
          {state?.roomCode ?? roomCode.toUpperCase()}
        </h1>
        {state?.expired && (
          <p className="font-body text-cream/60 mt-2">This room has closed.</p>
        )}

        {!state?.tables ? (
          <>
            <p className="font-heading text-xs tracking-[0.25em] uppercase text-cream/40 mt-10">
              {state ? `${state.joined.length} in the room` : "…"}
            </p>
            <div className="flex flex-wrap justify-center gap-2.5 mt-4 max-w-3xl">
              {(state?.joined ?? []).map((h) => (
                <span
                  key={h}
                  className="font-heading font-semibold text-lg px-5 py-2 rounded-full border border-cream/20"
                >
                  {h}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10 w-full max-w-4xl">
            {state.tables.map((t) => (
              <div key={t.n} className="rounded-2xl border border-cream/15 px-5 py-4 text-left">
                <p className="font-display text-3xl text-orange">Table {t.n}</p>
                <ul className="mt-2 space-y-1">
                  {t.handles.map((h) => (
                    <li key={h} className="font-heading font-semibold text-lg">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {state?.tables && (
          <p className="font-body text-cream/50 mt-8 max-w-xl">
            Find your table. Your phone shows your career for the round. Read your day silently,
            then read the clues out loud, one at a time. The fewer clues it takes, the better.
          </p>
        )}
      </div>

      {hostToken && (
        <div className="px-6 pb-8 flex flex-col items-center gap-3">
          {notice && <p className="font-body text-sm text-orange">{notice}</p>}
          <div className="flex flex-wrap justify-center gap-3">
            {!state?.tables ? (
              <button
                onClick={() => hostAction("assign")}
                disabled={busy !== null || (state?.joined.length ?? 0) < 2}
                className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-10 py-4 rounded-full disabled:opacity-40"
              >
                {busy === "assign" ? "Dealing…" : "Make the tables"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => hostAction("assign")}
                  disabled={busy !== null}
                  className="border border-cream/25 hover:border-cream/60 transition-colors text-cream/80 font-heading text-sm px-8 py-4 rounded-full disabled:opacity-40"
                >
                  {busy === "assign" ? "Dealing…" : "Re-deal tables"}
                </button>
                <button
                  onClick={() => hostAction("deliver")}
                  disabled={busy !== null}
                  className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-10 py-4 rounded-full disabled:opacity-40"
                >
                  {busy === "deliver" ? "Sending…" : "Send every deck to my inbox"}
                </button>
              </>
            )}
          </div>
          <p className="font-body text-[11px] text-cream/30">
            Only you see these buttons. Keep this tab for the projector.
          </p>
        </div>
      )}
    </div>
  );
}
