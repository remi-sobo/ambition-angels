/**
 * Story photo handling: what we accept, and the metadata we strip before a
 * single byte reaches storage.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * A photo taken on a phone carries EXIF: GPS coordinates, the exact timestamp,
 * the device serial, sometimes the owner's name. On a photo of a minor at a
 * program site, that is a precise home-or-school location attached to a child,
 * and it survives every download, every forward, and every newsletter. Nothing
 * in this repo stripped it before now — the documents upload route accepts
 * image/jpeg and stores the bytes untouched.
 *
 * ── Why it is hand-rolled ────────────────────────────────────────────────────
 * The obvious answer is `sharp`, but that means a native dependency and a full
 * decode/re-encode: slower, lossy, and it changes the pixels. Both JPEG and PNG
 * are container formats whose metadata lives in skippable, self-describing
 * segments. Dropping those segments is LOSSLESS — the image data is copied
 * through byte for byte — and needs no dependency at all. It is also the kind
 * of code that must be tested rather than trusted, which tests/comms-media
 * does against real byte layouts.
 *
 * Fails CLOSED: anything we cannot parse with confidence is rejected, never
 * passed through on the hope that it carried no metadata.
 */

/** 10 MB, mirrored by the comms-media bucket's own file_size_limit. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/** JPEG and PNG only in v1. Both are formats we can strip losslessly and
 *  verify. WebP/HEIC/AVIF carry metadata in containers this module does not
 *  parse, so they are refused rather than stored with their EXIF intact. */
export const MEDIA_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const isAllowedMediaMime = (mime: string): boolean =>
  Object.prototype.hasOwnProperty.call(MEDIA_EXT_BY_MIME, mime);

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

// ── JPEG ─────────────────────────────────────────────────────────────────────
// A JPEG is SOI (FFD8) followed by marker segments, then compressed scan data.
// Each marker is FF <code>; most carry a big-endian 2-byte length that includes
// the length bytes themselves.
//
// We drop:
//   APP1  (FFE1) — Exif AND XMP. This is where GPS, timestamps, camera serial,
//                  and creator name live. The whole reason for this module.
//   APP3..APP12, APP13 (Photoshop/IPTC), APP15 — proprietary and metadata-bearing.
//   COM   (FFFE) — free-text comments.
// We keep:
//   APP0  (FFE0) — JFIF density/thumbnail header some decoders expect.
//   APP2  (FFE2) — ICC colour profile. Dropping it visibly shifts colour.
//   everything structural (quantization tables, Huffman tables, frame headers).

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;

/** Standalone markers that carry no length field. */
const isStandalone = (marker: number): boolean =>
  marker === SOI || marker === EOI || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;

function shouldDropJpegSegment(marker: number): boolean {
  if (marker === COM) return true;
  if (marker < 0xe0 || marker > 0xef) return false; // not an APPn
  if (marker === 0xe0) return false; // APP0 JFIF — keep
  if (marker === 0xe2) return false; // APP2 ICC — keep
  return true;
}

function stripJpeg(buf: Uint8Array): Uint8Array {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== SOI) {
    throw new UnsupportedImageError("Not a JPEG file.");
  }
  const keep: Array<[number, number]> = [[0, 2]]; // the SOI
  let i = 2;

  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      throw new UnsupportedImageError("Malformed JPEG: expected a marker.");
    }
    // Markers may be padded with any number of 0xFF fill bytes.
    let j = i + 1;
    while (j < buf.length && buf[j] === 0xff) j++;
    if (j >= buf.length) throw new UnsupportedImageError("Truncated JPEG.");
    const marker = buf[j];

    if (isStandalone(marker)) {
      keep.push([i, j + 1]);
      i = j + 1;
      continue;
    }
    if (j + 2 >= buf.length) throw new UnsupportedImageError("Truncated JPEG segment.");
    const length = (buf[j + 1] << 8) | buf[j + 2];
    if (length < 2) throw new UnsupportedImageError("Malformed JPEG segment length.");
    const end = j + 1 + length;
    if (end > buf.length) throw new UnsupportedImageError("Truncated JPEG segment.");

    if (marker === SOS) {
      // Scan data runs from here to the end of the file. It is entropy-coded
      // and cannot contain further segments we care about, so copy the rest
      // verbatim — including any trailing EOI.
      keep.push([i, buf.length]);
      i = buf.length;
      break;
    }
    if (!shouldDropJpegSegment(marker)) keep.push([i, end]);
    i = end;
  }

  return concat(buf, keep);
}

// ── PNG ──────────────────────────────────────────────────────────────────────
// 8-byte signature, then chunks: length(4, big-endian) type(4) data(length)
// crc(4). We drop the ancillary chunks that carry metadata and keep everything
// else — including iCCP/gAMA/sRGB/cHRM, which affect rendering.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** eXIf is EXIF proper; tEXt/zTXt/iTXt are text (XMP lives in iTXt); tIME is a
 *  modification timestamp. */
const PNG_DROP_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(buf: Uint8Array): Uint8Array {
  if (buf.length < 8 || !PNG_SIGNATURE.every((b, k) => buf[k] === b)) {
    throw new UnsupportedImageError("Not a PNG file.");
  }
  const keep: Array<[number, number]> = [[0, 8]];
  let i = 8;

  while (i < buf.length) {
    if (i + 8 > buf.length) throw new UnsupportedImageError("Truncated PNG chunk header.");
    const length =
      ((buf[i] << 24) >>> 0) + (buf[i + 1] << 16) + (buf[i + 2] << 8) + buf[i + 3];
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    const end = i + 12 + length; // header(8) + data + crc(4)
    if (length < 0 || end > buf.length) {
      throw new UnsupportedImageError("Truncated PNG chunk.");
    }
    if (!PNG_DROP_CHUNKS.has(type)) keep.push([i, end]);
    i = end;
    if (type === "IEND") break;
  }

  return concat(buf, keep);
}

function concat(buf: Uint8Array, ranges: Array<[number, number]>): Uint8Array {
  const total = ranges.reduce((n, [a, b]) => n + (b - a), 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const [a, b] of ranges) {
    out.set(buf.subarray(a, b), at);
    at += b - a;
  }
  return out;
}

/**
 * Return the image with every metadata segment removed. Pixel data is copied
 * through untouched — this is a container edit, not a re-encode.
 *
 * Throws UnsupportedImageError for anything unparseable or of an unsupported
 * type. Callers must let that become a 400, never fall back to the original
 * bytes: an image we could not strip is an image we must not store.
 */
export function stripImageMetadata(bytes: Uint8Array, mime: string): Uint8Array {
  switch (mime) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    default:
      throw new UnsupportedImageError(`Cannot strip metadata from ${mime || "this file"}.`);
  }
}

/** True when the bytes still contain a recognisable metadata marker. Used by
 *  the tests, and cheap enough to assert in the upload route as a belt-and-
 *  braces check that the stripper actually did something. */
export function hasImageMetadata(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    for (let i = 0; i + 1 < bytes.length; i++) {
      if (bytes[i] !== 0xff) continue;
      const m = bytes[i + 1];
      if (m === SOS) return false; // scan data — stop looking
      if (shouldDropJpegSegment(m)) return true;
    }
    return false;
  }
  if (mime === "image/png") {
    for (let i = 8; i + 8 <= bytes.length; ) {
      const length =
        ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
      const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (PNG_DROP_CHUNKS.has(type)) return true;
      const next = i + 12 + length;
      if (next <= i || next > bytes.length) break;
      i = next;
      if (type === "IEND") break;
    }
    return false;
  }
  return false;
}

/** A filesystem-safe basename, mirroring lib/documents/config.ts's rule. */
export function safeMediaFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "photo").trim();
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "");
  return (cleaned || "photo").slice(0, 100);
}

/** {org_id}/{story_id}/{filename} — org id FIRST, because the comms-media
 *  storage policies key off (storage.foldername(name))[1]. */
export function mediaStoragePath(orgId: string, storyId: string, filename: string): string {
  return `${orgId}/${storyId}/${filename}`;
}
