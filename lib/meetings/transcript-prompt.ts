import { TASK_CATEGORIES } from "@/app/admin/ops/_types/ops";

/**
 * Pure builder for Reed's transcript-parse prompt (no I/O, no server-only), so the
 * agenda-aware debrief branch is unit-testable. When an agenda is present the recap
 * becomes a prep-vs-actual debrief and follow-ups prioritize what was left open.
 * lib/meetings/reed.ts wraps this with the Anthropic call.
 */

export const MAX_TRANSCRIPT_CHARS = 12_000;
export const MAX_AGENDA_CHARS = 4_000;

export type TranscriptPromptInput = {
  title: string | null;
  transcript: string;
  attendees?: string[];
  /** The agenda Reed drafted before the meeting, if any — turns the recap into a prep-vs-actual debrief. */
  agenda?: string | null;
};

export function buildTranscriptPrompt(input: TranscriptPromptInput): string {
  const who = input.attendees?.length ? `\nAttendees: ${input.attendees.join(", ")}` : "";
  const agenda = input.agenda?.trim() ? input.agenda.trim().slice(0, MAX_AGENDA_CHARS) : "";

  const task = agenda
    ? `Read this meeting transcript AND the prep agenda that was drafted beforehand, then produce:
1. A 3–4 sentence debrief: what was discussed and decided, and — comparing against the prep agenda — which planned items were covered and which were left open or unresolved.
2. 1 to 3 concrete follow-up tasks, PRIORITIZING the agenda items that were not resolved, each a short imperative title.`
    : `Read this meeting transcript and produce:
1. A 2–3 sentence summary of what was discussed and decided.
2. 1 to 3 concrete follow-up tasks the operator should do, each a short imperative title.`;

  const agendaBlock = agenda ? `\nPrep agenda (drafted before the meeting):\n${agenda}\n` : "";

  return `You are Reed, the operations AI for a nonprofit CEO. ${task}

Categories must be one of: ${TASK_CATEGORIES.join(", ")}.

Return ONLY minified JSON, no prose, no code fences, in exactly this shape:
{"summary":"...","suggestions":[{"title":"...","category":"fundraising"}]}

Meeting title: ${input.title ?? "(untitled)"}${who}
${agendaBlock}Transcript:
${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`;
}
