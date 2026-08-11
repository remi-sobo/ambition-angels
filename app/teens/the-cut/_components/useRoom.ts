"use client";

// Shared client plumbing for The Cut screens: the state poller and the
// phone's anonymous identity. The voter id is a random string in
// localStorage — no name, no email, nothing a human chose (the games
// collect nothing; specs/teen-games-v1.md locked decision 4).

import { useCallback, useEffect, useRef, useState } from "react";

export type CutHistoryEntry = {
  round: number;
  ruleId: string;
  cutSoc: string;
  explain: string;
  roomRight: boolean;
  tally: Record<string, number>;
};

export type CutRoomView = {
  roomCode: string;
  expired: boolean;
  joined: number;
  votesIn: number;
  quorum: number;
  round: number;
  phase: "vote" | "done";
  lives: number;
  rule: { id: string; text: string } | null;
  careers: { soc: string; title: string; reveal: string; cut: boolean; cutRound: number | null }[];
  history: CutHistoryEntry[];
  survivor: {
    soc: string;
    title: string;
    reveal: string;
    pay_median: number;
    pay_p90: number | null;
    education: string | null;
    vignette: string | null;
  } | null;
};

const VOTER_KEY = "cut:voter";

export function getVoterId(): string {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

export function useRoomState(code: string, intervalMs: number) {
  const [state, setState] = useState<CutRoomView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/the-cut/room/${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      if (res.status === 404) return setNotFound(true);
      if (!res.ok) return;
      setState((await res.json()) as CutRoomView);
    } catch {
      /* transient — next poll retries */
    }
  }, [code]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh, intervalMs]);

  return { state, notFound, refresh };
}

export async function postRoom(
  code: string,
  path: "join" | "vote" | "resolve",
  body: unknown
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`/api/games/the-cut/room/${encodeURIComponent(code)}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}
