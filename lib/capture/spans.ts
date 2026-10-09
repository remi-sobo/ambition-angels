/**
 * Name-span extraction (specs/bloomos-capture.md, C2 step 3). Pure.
 *
 * The matcher never sees the whole transcript: it sees short spans that look
 * like names or organizations, and asks the trigram RPC about each one. Two
 * cheap heuristics, no NLP:
 *
 *   1. Runs of capitalized tokens that are not at the start of a sentence
 *      ("Maria Chen", "Koshland Foundation", "the Sobomehins" -> "Sobomehins").
 *      A sentence-initial run counts when it is two or more tokens ("Maria Chen
 *      wants ..."), or a single token that is not a common sentence opener
 *      ("Kendra called ...").
 *   2. Up to three tokens after a cue word (with, from, call, email, text,
 *      tell, met, ask, ...), stopping at a stopword or punctuation. This is
 *      what catches lowercase speech-to-text output ("coffee with maria chen").
 *
 * Deduped case-insensitively, at most MAX_SPANS. Over-extraction is cheap (an
 * extra RPC call that returns nothing); under-extraction loses a match, so the
 * rules lean generous.
 */

import { MAX_SPANS } from "./constants";

const CUE_WORDS = new Set([
  "with",
  "from",
  "call",
  "called",
  "email",
  "emailed",
  "text",
  "texted",
  "tell",
  "told",
  "met",
  "meet",
  "meeting",
  "ask",
  "asked",
  "ping",
  "remind",
  "thank",
  "thanked",
  "saw",
  "see",
  "visit",
  "visited",
  "into",
  "said",
  "says",
]);

/** Tokens that end a cue span, and lowercase tokens never kept as a span. */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "our",
  "my",
  "your",
  "their",
  "his",
  "her",
  "its",
  "this",
  "that",
  "these",
  "those",
  "about",
  "at",
  "on",
  "for",
  "and",
  "or",
  "but",
  "so",
  "if",
  "in",
  "of",
  "by",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "it",
  "me",
  "us",
  "him",
  "them",
  "then",
  "than",
  "also",
  "just",
  "really",
  "maybe",
  "please",
  "today",
  "tomorrow",
  "yesterday",
  "tonight",
  "later",
  "again",
  "back",
  "up",
  "out",
  "over",
  "re",
  "before",
  "after",
  "next",
  "last",
  "week",
  "month",
  "year",
  "friday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "i",
  "we",
  "you",
  "he",
  "she",
  "they",
  "who",
  "what",
  "when",
  "where",
  "why",
  "how",
  "not",
  "no",
  "yes",
  "ok",
  "okay",
  "yeah",
  "um",
  "uh",
  "like",
  "some",
  "any",
  "all",
  "one",
  "two",
  "three",
  "both",
  "each",
  "him",
  "them",
  "her",
  "to",
  "might",
  "will",
  "would",
  "could",
  "can",
  "should",
  "said",
  "says",
  "want",
  "wants",
  "wanted",
  "asked",
  "mentioned",
  "offered",
  "called",
]);

/** Capitalized tokens that open sentences in dictated notes and are never names on their own. */
const SENTENCE_OPENERS = new Set([
  "also",
  "and",
  "ask",
  "but",
  "call",
  "coffee",
  "email",
  "follow",
  "get",
  "had",
  "have",
  "he",
  "i",
  "it",
  "just",
  "let",
  "lunch",
  "make",
  "maybe",
  "meeting",
  "met",
  "need",
  "no",
  "note",
  "ok",
  "okay",
  "please",
  "remind",
  "reminder",
  "send",
  "she",
  "so",
  "talk",
  "talked",
  "tell",
  "text",
  "thanks",
  "the",
  "then",
  "they",
  "this",
  "today",
  "tomorrow",
  "we",
  "yeah",
  "yes",
  "also",
  "quick",
  "update",
  "add",
  "schedule",
  "look",
  "check",
  "draft",
  "write",
  "book",
  "set",
  "put",
  "move",
  "pull",
  "reach",
  "touch",
  "circle",
  "loop",
  "ping",
  "task",
  "thought",
  "idea",
  "don't",
  "dont",
  "can",
  "could",
  "should",
  "would",
  "will",
  "went",
  "got",
  "give",
  "gave",
  "my",
  "our",
  "their",
  "his",
  "her",
  "its",
  "a",
  "an",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "to",
  "of",
  "by",
  "if",
  "when",
  "while",
  "after",
  "before",
  "next",
  "last",
  "first",
  "second",
  "one",
  "two",
  "three",
  "good",
  "great",
  "big",
  "new",
  "old",
  "she's",
  "he's",
  "they're",
  "we're",
  "it's",
  "i'm",
  "there",
  "here",
  "that",
  "these",
  "those",
  "what",
  "who",
  "where",
  "why",
  "how",
  "not",
  "never",
  "always",
  "still",
  "really",
  "very",
  "more",
  "most",
  "some",
  "any",
  "all",
  "every",
  "no",
  "none",
]);

const TOKEN_RE = /[A-Za-z][A-Za-z'’.-]*/g;
const CAPITALIZED_RE = /^[A-Z][A-Za-z'’.-]*$/;
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;

function normalizeToken(t: string): string {
  return t.replace(/[.'’]+$/g, "");
}

function isCapitalized(t: string): boolean {
  return CAPITALIZED_RE.test(t) && t.length > 1;
}

function isStopword(t: string): boolean {
  return STOPWORDS.has(t.toLowerCase());
}

function pushSpan(out: string[], seen: Set<string>, tokens: string[]): void {
  const span = tokens.map(normalizeToken).filter(Boolean).join(" ").trim();
  if (span.length < 2) return;
  const key = span.toLowerCase();
  if (seen.has(key)) return;
  // A lone stopword or opener is not a name.
  if (tokens.length === 1 && (isStopword(key) || SENTENCE_OPENERS.has(key))) return;
  seen.add(key);
  out.push(span);
}

/** Rule 1: capitalized runs. */
function capitalizedRuns(sentence: string, out: string[], seen: Set<string>): void {
  const tokens = sentence.match(TOKEN_RE) ?? [];
  let run: string[] = [];
  let runStart = -1;
  const flush = () => {
    if (run.length === 0) return;
    const atStart = runStart === 0;
    const single = run.length === 1;
    const first = normalizeToken(run[0]).toLowerCase();
    // Drop stopword-ish tokens from the edges of the run (e.g. a capitalized "The").
    while (run.length && (isStopword(normalizeToken(run[0]).toLowerCase()) || SENTENCE_OPENERS.has(normalizeToken(run[0]).toLowerCase()))) run.shift();
    while (run.length && isStopword(normalizeToken(run[run.length - 1]).toLowerCase())) run.pop();
    if (run.length === 0) {
      run = [];
      return;
    }
    if (atStart && single && SENTENCE_OPENERS.has(first)) {
      run = [];
      return;
    }
    pushSpan(out, seen, run);
    run = [];
  };
  tokens.forEach((tok, i) => {
    if (isCapitalized(tok)) {
      if (run.length === 0) runStart = i;
      run.push(tok);
    } else {
      flush();
    }
  });
  flush();
}

/** Rule 2: tokens after a cue word. In normally cased text the span must start
 *  with a capital; in lowercase speech-to-text output (no capitalized token
 *  anywhere past a sentence start) any run is allowed. */
function cueSpans(sentence: string, out: string[], seen: Set<string>, lowercaseMode: boolean): void {
  const tokens = sentence.match(TOKEN_RE) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    if (!CUE_WORDS.has(tokens[i].toLowerCase())) continue;
    if (!lowercaseMode && !(tokens[i + 1] && isCapitalized(tokens[i + 1]))) continue;
    const span: string[] = [];
    for (let j = i + 1; j < tokens.length && span.length < 3; j++) {
      const t = tokens[j];
      const low = normalizeToken(t).toLowerCase();
      if (isStopword(low) || CUE_WORDS.has(low)) break;
      span.push(t);
      // Punctuation after the token ends the span ("with Maria Chen, she ...").
      if (/[.,;:!?]$/.test(t)) break;
    }
    // Cue spans must look like names: skip common verbs/nouns that follow cues.
    if (span.length && !SENTENCE_OPENERS.has(normalizeToken(span[0]).toLowerCase())) {
      pushSpan(out, seen, span);
    }
  }
}

/**
 * Extract candidate name/org spans from a transcript. Deterministic, ordered by
 * first appearance, at most MAX_SPANS.
 */
export function extractNameSpans(transcript: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const text = (transcript ?? "").replace(/\s+/g, " ").trim();
  if (!text) return out;
  const sentences = text.split(SENTENCE_SPLIT_RE);
  // Lowercase mode: speech-to-text that never capitalizes. Detected by the
  // absence of any capitalized token that is not a sentence opener.
  const lowercaseMode = !sentences.some((s) => (s.match(TOKEN_RE) ?? []).slice(1).some(isCapitalized));
  for (const sentence of sentences) {
    capitalizedRuns(sentence, out, seen);
    cueSpans(sentence, out, seen, lowercaseMode);
    if (out.length >= MAX_SPANS) break;
  }
  return out.slice(0, MAX_SPANS);
}
