import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RedactableSubject } from "./redact";
import type { SubjectType } from "./stories";

/**
 * Gather everything the redactor needs to know about the people in a story.
 *
 * ── Why this is a service-role read, and why that is the safe choice ─────────
 * Redaction has to know a name in order to remove it. If this read went through
 * the session client, a caller WITHOUT comms.subjects.read would have the
 * participant's subject row hidden by RLS — so the redactor would not know that
 * person exists, and a name they typed into the story body would sail straight
 * through to the model. The permission that exists to protect the participant
 * would have caused the leak.
 *
 * So the lookup is deliberately privileged and deliberately narrow: it reads
 * only names, only for one story, only within the caller's org, and the names
 * are used exclusively to build replacement patterns. Nothing here is returned
 * to the caller, rendered, or stored — `redactStoryForModel`'s grounding
 * records that a subject WAS redacted, never what it was called.
 *
 * The route has already established comms.manage and that the story is in
 * v_publishable_stories before this runs.
 */

/** Where a subject_id points, and which columns hold a name there. */
const NAME_SOURCES: Record<Exclude<SubjectType, "none">, { table: string; columns: string[] }> = {
  participant: { table: "students", columns: ["first_name", "last_name"] },
  constituent: { table: "constituents", columns: ["first_name", "last_name", "org_name"] },
  partner: { table: "partners", columns: ["name", "champion_name"] },
  staff: { table: "staff", columns: ["full_name"] },
};

type SubjectRow = {
  id: string;
  subject_type: string;
  subject_id: string | null;
  display_label: string;
  is_minor: boolean;
  consents: Array<{
    scope: string[] | null;
    requested_at: string | null;
    granted_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }> | null;
};

export async function loadSubjectNames(
  _session: SupabaseClient,
  orgId: string,
  storyId: string,
): Promise<RedactableSubject[]> {
  const admin = getSupabaseAdmin();

  const { data: rows } = await admin
    .from("story_subjects")
    .select(
      `id, subject_type, subject_id, display_label, is_minor,
       consents:story_consents (scope, requested_at, granted_at, expires_at, revoked_at)`,
    )
    .eq("org_id", orgId)
    .eq("story_id", storyId);

  const subjects = (rows ?? []) as unknown as SubjectRow[];
  if (subjects.length === 0) return [];

  // One query per target table, not per subject.
  const byTable = new Map<string, string[]>();
  for (const s of subjects) {
    if (!s.subject_id || s.subject_type === "none") continue;
    const src = NAME_SOURCES[s.subject_type as Exclude<SubjectType, "none">];
    if (!src) continue;
    byTable.set(src.table, [...(byTable.get(src.table) ?? []), s.subject_id]);
  }

  const namesById = new Map<string, string[]>();
  await Promise.all(
    Array.from(byTable.entries()).map(async ([table, ids]) => {
      const src = Object.values(NAME_SOURCES).find((s) => s.table === table)!;
      const { data } = await admin
        .from(table)
        .select(["id", ...src.columns].join(", "))
        .eq("org_id", orgId)
        .in("id", ids);
      for (const rec of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const parts = src.columns
          .map((c) => rec[c])
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
        // Both the parts and the assembled full name — "Marcus", "Chen", and
        // "Marcus Chen" are three different things to hunt for.
        const full = parts.join(" ").trim();
        namesById.set(rec.id as string, full ? [...parts, full] : parts);
      }
    }),
  );

  return subjects.map((s) => ({
    id: s.id,
    subject_type: s.subject_type as SubjectType,
    display_label: s.display_label,
    is_minor: s.is_minor,
    consents: s.consents ?? [],
    knownNames: s.subject_id ? (namesById.get(s.subject_id) ?? []) : [],
  }));
}
