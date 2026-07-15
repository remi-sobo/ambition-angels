import { DOC_TYPES } from "@/lib/documents/config";
import { TASK_CATEGORIES } from "@/app/admin/ops/_types/ops";

/**
 * Typed document-extraction payloads (spec #6, Phase 4 / decision B: two
 * kinds, no more). Validated in BOTH directions — when Reed's
 * propose_document_extraction tool writes a reed_suggestions row, and again
 * when the accept route applies one — so a row that predates a rule change
 * can't sneak through the applier. Whitelist semantics: unknown keys are
 * DROPPED, unknown kinds are rejected, which is the guard against the
 * "untyped payload sprawl" failure mode. Pure module; shared with tests.
 */

export type DocumentFieldsPayload = {
  kind: "document_fields";
  document_id: string;
  /** YYYY-MM-DD; feeds documents.expires_at → the renewal queue arm. */
  expires_at?: string;
  doc_type?: string;
};

export type ObligationTaskPayload = {
  kind: "obligation_task";
  document_id: string;
  title: string;
  due_date?: string;
  description?: string;
  category?: string;
};

export type ExtractionPayload = DocumentFieldsPayload | ObligationTaskPayload;

export const EXTRACTION_KINDS = ["document_fields", "obligation_task"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

type ParseResult = { ok: true; payload: ExtractionPayload } | { ok: false; error: string };

export function parseExtractionPayload(v: unknown): ParseResult {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, error: "payload must be an object" };
  }
  const p = v as Record<string, unknown>;
  const kind = p.kind;
  const documentId = p.document_id;
  if (typeof documentId !== "string" || !UUID.test(documentId)) {
    return { ok: false, error: "payload.document_id must be a document uuid" };
  }

  if (kind === "document_fields") {
    const out: DocumentFieldsPayload = { kind, document_id: documentId };
    if (p.expires_at != null) {
      if (typeof p.expires_at !== "string" || !ISO_DATE.test(p.expires_at)) {
        return { ok: false, error: "expires_at must be YYYY-MM-DD" };
      }
      out.expires_at = p.expires_at;
    }
    if (p.doc_type != null) {
      if (typeof p.doc_type !== "string" || !(DOC_TYPES as readonly string[]).includes(p.doc_type)) {
        return { ok: false, error: `doc_type must be one of: ${DOC_TYPES.join(", ")}` };
      }
      out.doc_type = p.doc_type;
    }
    if (out.expires_at == null && out.doc_type == null) {
      return { ok: false, error: "document_fields needs expires_at and/or doc_type" };
    }
    return { ok: true, payload: out };
  }

  if (kind === "obligation_task") {
    const title = typeof p.title === "string" ? p.title.trim() : "";
    if (!title) return { ok: false, error: "obligation_task needs a title" };
    const out: ObligationTaskPayload = { kind, document_id: documentId, title: title.slice(0, 300) };
    if (p.due_date != null) {
      if (typeof p.due_date !== "string" || !ISO_DATE.test(p.due_date)) {
        return { ok: false, error: "due_date must be YYYY-MM-DD" };
      }
      out.due_date = p.due_date;
    }
    if (p.description != null && typeof p.description === "string") {
      out.description = p.description.slice(0, 2000);
    }
    if (p.category != null) {
      if (typeof p.category !== "string" || !(TASK_CATEGORIES as readonly string[]).includes(p.category)) {
        return { ok: false, error: `category must be one of: ${TASK_CATEGORIES.join(", ")}` };
      }
      out.category = p.category;
    }
    return { ok: true, payload: out };
  }

  return { ok: false, error: `unknown extraction kind: ${String(kind)}` };
}

/** The domain (→ `${domain}.write` accept permission) each kind rides under. */
export const EXTRACTION_DOMAIN: Record<ExtractionPayload["kind"], string> = {
  document_fields: "documents",
  obligation_task: "ops",
};
