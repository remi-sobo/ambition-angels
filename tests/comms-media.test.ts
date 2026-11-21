import { describe, expect, test } from "vitest";

import {
  hasImageMetadata,
  isAllowedMediaMime,
  mediaStoragePath,
  safeMediaFilename,
  stripImageMetadata,
  UnsupportedImageError,
} from "../lib/comms/media";

/**
 * The stripper is the only thing standing between a phone photo of a minor and
 * a stored file carrying that child's GPS coordinates. It is hand-rolled, so it
 * gets tested against real byte layouts rather than trusted.
 *
 * Two properties matter and are checked separately:
 *   1. every metadata segment is gone, and
 *   2. the pixel data is byte-identical — this is a container edit, not a
 *      re-encode, and a "stripper" that quietly mangled the image would be
 *      worse than none.
 */

// ── Builders ─────────────────────────────────────────────────────────────────

const bytes = (...v: number[]) => Uint8Array.from(v);

function segment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}

/** A real-shaped Exif APP1 payload: "Exif\0\0" then a little-endian TIFF header
 *  and a GPS-ish tag block. Contents don't have to be a valid IFD for the
 *  container walk, but the identifier and structure are the real thing. */
const EXIF_PAYLOAD = [
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
  0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header, little-endian
  0x01, 0x00, // 1 IFD entry
  0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, // GPS IFD pointer
  0x00, 0x00, 0x00, 0x00,
];

const XMP_PAYLOAD = [
  ...Array.from("http://ns.adobe.com/xap/1.0/\0").map((c) => c.charCodeAt(0)),
  0x3c, 0x78, 0x3a, 0x78, // "<x:x"
];

const JFIF_PAYLOAD = [
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
];

const ICC_PAYLOAD = [
  ...Array.from("ICC_PROFILE\0").map((c) => c.charCodeAt(0)),
  0x01, 0x01, 0xde, 0xad, 0xbe, 0xef,
];

/** Distinctive fake scan data, so we can assert it survives untouched. */
const SCAN = [0x01, 0x02, 0x03, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x42];

function jpeg(opts: { exif?: boolean; xmp?: boolean; jfif?: boolean; icc?: boolean; comment?: boolean; iptc?: boolean } = {}) {
  const out: number[] = [0xff, 0xd8]; // SOI
  if (opts.jfif) out.push(...segment(0xe0, JFIF_PAYLOAD));
  if (opts.exif) out.push(...segment(0xe1, EXIF_PAYLOAD));
  if (opts.xmp) out.push(...segment(0xe1, XMP_PAYLOAD));
  if (opts.icc) out.push(...segment(0xe2, ICC_PAYLOAD));
  if (opts.iptc) out.push(...segment(0xed, [0x50, 0x68, 0x6f, 0x74, 0x6f]));
  if (opts.comment) out.push(...segment(0xfe, [0x68, 0x69]));
  out.push(...segment(0xdb, [0x00, 0x10, 0x20])); // DQT — structural, must survive
  out.push(...segment(0xc0, [0x08, 0x00, 0x10, 0x00, 0x10, 0x01])); // SOF0
  out.push(...segment(0xda, [0x01, 0x01, 0x00])); // SOS header
  out.push(...SCAN, 0xff, 0xd9); // scan data + EOI
  return Uint8Array.from(out);
}

function pngChunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...Array.from(type).map((c) => c.charCodeAt(0)),
    ...data,
    0xde, 0xad, 0xbe, 0xef, // CRC placeholder — never validated by the stripper
  ];
}

const IDAT_DATA = [0x78, 0x9c, 0x01, 0x02, 0x03, 0x04];

function png(opts: { exif?: boolean; text?: boolean; itxt?: boolean; time?: boolean; iccp?: boolean } = {}) {
  const out: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  out.push(...pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
  if (opts.exif) out.push(...pngChunk("eXIf", [0x49, 0x49, 0x2a, 0x00]));
  if (opts.text) out.push(...pngChunk("tEXt", Array.from("Author\0Jane").map((c) => c.charCodeAt(0))));
  if (opts.itxt) out.push(...pngChunk("iTXt", Array.from("XML:com.adobe.xmp\0").map((c) => c.charCodeAt(0))));
  if (opts.time) out.push(...pngChunk("tIME", [0x07, 0xea, 1, 1, 0, 0, 0]));
  if (opts.iccp) out.push(...pngChunk("iCCP", [0x73, 0x52, 0x47, 0x42, 0x00, 0x00]));
  out.push(...pngChunk("IDAT", IDAT_DATA));
  out.push(...pngChunk("IEND", []));
  return Uint8Array.from(out);
}

/** Does `hay` contain `needle` as a contiguous run? */
function contains(hay: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let k = 0; k < needle.length; k++) if (hay[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
}

// ── Real encoder output ──────────────────────────────────────────────────────
// The builders above are hand-assembled, which proves the container walk but
// not that it survives what a real encoder emits. These three fixtures are real
// Pillow output, embedded as base64 so the repo stays text-only. The GPS one
// carries an actual coordinate pair for a real place, which is exactly the
// leak this module exists to prevent.

// 64x48 JPEG from Pillow carrying a real Exif APP1: GPS 37.4419N/122.1430W,
// Make/Model "Apple iPhone 15 Pro", Artist "Jane Doe", and a body serial.
const JPEG_WITH_GPS_EXIF_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QEhRXhpZgAATU0AKgAAAAgABgEPAAIAAAAGAAAAVgEQAAIAAAAOAAAAXAE7AAIAAAAJ" +
  "AAAAaoKYAAIAAAAJAAAAc4dpAAQAAAABAAAAfIglAAQAAAABAAAAtwAAAABBcHBsZQBpUGhvbmUgMTUgUHJvAEphbmUgRG9l" +
  "AEphbmUgRG9lAAACkAMAAgAAABQAAACWpDEAAgAAAA0AAACqMjAyNjowODoxOSAxNDowMzoxMQBTRVJJQUwxMjM0NTYAAAQA" +
  "AQACAAAAAk4AAAAAAgAFAAAAAwAAAOkAAwACAAAAAlcAAAAABAAFAAAAAwAAAQEAAAAlAAAAAQAAABoAAAABAAAMDAAAAGQA" +
  "AAB6AAAAAQAAAAgAAAABAAANmAAAAGT/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsL" +
  "EBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU" +
  "FBQUFBQUFBQUFBQUFBQUFBT/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QA" +
  "tRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3" +
  "ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLD" +
  "xMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QA" +
  "tREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2" +
  "Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6" +
  "wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDCooor8KP6dCiiigAooooAKKKKACii" +
  "igAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k=";

// The SAME image, re-saved by Pillow with no Exif at all. Stripping the file
// above must reproduce this byte for byte.
const JPEG_SAVED_WITHOUT_EXIF_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQ" +
  "ERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU" +
  "FBQUFBQUFBQUFBQUFBT/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA" +
  "AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6" +
  "Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
  "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA" +
  "AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5" +
  "OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPE" +
  "xcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDCooor8KP6dCiiigAooooAKKKKACiiigAo" +
  "oooAKKKKACiiigAooooAKKKKACiiigAooooA/9k=";

// The same image as PNG with tEXt chunks naming a person and a location.
const PNG_WITH_TEXT_META_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAD3RFWHRBdXRob3IASmFuZSBEb2U0ahlJAAAAMXRFWHRDb21t" +
  "ZW50AHRha2VuIGF0IEVhc3RzaWRlIEhpZ2gsIDM3LjQ0MTksLTEyMi4xNDMw5F2HCQAAAFNJREFUeJztz0ENwCAAwEBADZpQ" +
  "jKyJ4HFZ0lPQznv2+LOlA141oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgfZQ3AarvjJqh" +
  "AAAAAElFTkSuQmCC";

const decode = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));
/** Latin-1 so every byte maps to a character and substring checks are exact. */
const asText = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("real encoder output", () => {
  test("a real photo's GPS, device, and owner name are all gone", () => {
    const src = decode(JPEG_WITH_GPS_EXIF_B64);
    // Prove the fixture really carries what we claim, so a silently-broken
    // fixture can't make this test pass by having nothing to remove.
    expect(asText(src)).toContain("Exif");
    expect(asText(src)).toContain("iPhone 15 Pro");
    expect(asText(src)).toContain("Jane Doe");
    expect(asText(src)).toContain("SERIAL123456");
    expect(hasImageMetadata(src, "image/jpeg")).toBe(true);

    const out = stripImageMetadata(src, "image/jpeg");
    expect(asText(out)).not.toContain("Exif");
    expect(asText(out)).not.toContain("iPhone 15 Pro");
    expect(asText(out)).not.toContain("Jane Doe");
    expect(asText(out)).not.toContain("SERIAL123456");
    expect(hasImageMetadata(out, "image/jpeg")).toBe(false);
  });

  test("the stripped file equals the same image saved with no Exif — lossless, byte for byte", () => {
    const stripped = stripImageMetadata(decode(JPEG_WITH_GPS_EXIF_B64), "image/jpeg");
    const clean = decode(JPEG_SAVED_WITHOUT_EXIF_B64);
    expect(Buffer.from(stripped).equals(Buffer.from(clean))).toBe(true);
  });

  test("a real PNG's tEXt metadata is gone and the image data survives", () => {
    const src = decode(PNG_WITH_TEXT_META_B64);
    expect(asText(src)).toContain("Jane Doe");
    expect(asText(src)).toContain("Eastside High");
    const out = stripImageMetadata(src, "image/png");
    expect(asText(out)).not.toContain("Jane Doe");
    expect(asText(out)).not.toContain("Eastside High");
    expect(asText(out)).toContain("IDAT");
    expect(asText(out)).toContain("IEND");
    expect(hasImageMetadata(out, "image/png")).toBe(false);
  });
});

// ── JPEG ─────────────────────────────────────────────────────────────────────

describe("stripImageMetadata — JPEG", () => {
  test("removes the Exif block that carries GPS", () => {
    const src = jpeg({ exif: true });
    expect(contains(src, EXIF_PAYLOAD)).toBe(true);
    const out = stripImageMetadata(src, "image/jpeg");
    expect(contains(out, EXIF_PAYLOAD)).toBe(false);
    expect(hasImageMetadata(out, "image/jpeg")).toBe(false);
    expect(out.length).toBeLessThan(src.length);
  });

  test("removes XMP, IPTC, and comments too — EXIF is not the only carrier", () => {
    const src = jpeg({ exif: true, xmp: true, iptc: true, comment: true });
    const out = stripImageMetadata(src, "image/jpeg");
    expect(contains(out, XMP_PAYLOAD)).toBe(false);
    expect(contains(out, [0x50, 0x68, 0x6f, 0x74, 0x6f])).toBe(false); // IPTC payload
    expect(hasImageMetadata(out, "image/jpeg")).toBe(false);
  });

  test("keeps the ICC colour profile — dropping it visibly shifts colour", () => {
    const out = stripImageMetadata(jpeg({ exif: true, icc: true }), "image/jpeg");
    expect(contains(out, ICC_PAYLOAD)).toBe(true);
  });

  test("keeps the JFIF header some decoders expect", () => {
    const out = stripImageMetadata(jpeg({ jfif: true, exif: true }), "image/jpeg");
    expect(contains(out, JFIF_PAYLOAD)).toBe(true);
  });

  test("scan data and structural segments survive byte for byte", () => {
    const out = stripImageMetadata(jpeg({ exif: true, xmp: true, comment: true }), "image/jpeg");
    expect(contains(out, SCAN)).toBe(true);
    expect(contains(out, [0x00, 0x10, 0x20])).toBe(true); // DQT payload
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8); // still starts with SOI
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9); // still ends with EOI
  });

  test("a clean JPEG comes back unchanged", () => {
    const src = jpeg({ jfif: true });
    const out = stripImageMetadata(src, "image/jpeg");
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  test("stripping twice is a no-op the second time", () => {
    const once = stripImageMetadata(jpeg({ exif: true }), "image/jpeg");
    const twice = stripImageMetadata(once, "image/jpeg");
    expect(Array.from(twice)).toEqual(Array.from(once));
  });

  test("tolerates 0xFF fill bytes before a marker", () => {
    const src = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xff, 0xff, 0xe1, 0x00, 0x08, 1, 2, 3, 4, 5, 6, // padded APP1
      ...segment(0xda, [0x01]),
      ...SCAN, 0xff, 0xd9,
    ]);
    const out = stripImageMetadata(src, "image/jpeg");
    expect(contains(out, [1, 2, 3, 4, 5, 6])).toBe(false);
    expect(contains(out, SCAN)).toBe(true);
  });
});

// ── PNG ──────────────────────────────────────────────────────────────────────

describe("stripImageMetadata — PNG", () => {
  test("removes eXIf, tEXt, iTXt, and tIME", () => {
    const src = png({ exif: true, text: true, itxt: true, time: true });
    expect(hasImageMetadata(src, "image/png")).toBe(true);
    const out = stripImageMetadata(src, "image/png");
    expect(hasImageMetadata(out, "image/png")).toBe(false);
    expect(contains(out, Array.from("Jane").map((c) => c.charCodeAt(0)))).toBe(false);
  });

  test("keeps iCCP, IHDR, IDAT, and IEND", () => {
    const out = stripImageMetadata(png({ exif: true, text: true, iccp: true }), "image/png");
    expect(contains(out, [0x73, 0x52, 0x47, 0x42])).toBe(true); // iCCP payload
    expect(contains(out, IDAT_DATA)).toBe(true);
    expect(contains(out, Array.from("IHDR").map((c) => c.charCodeAt(0)))).toBe(true);
    expect(contains(out, Array.from("IEND").map((c) => c.charCodeAt(0)))).toBe(true);
  });

  test("the signature survives", () => {
    const out = stripImageMetadata(png({ text: true }), "image/png");
    expect(Array.from(out.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  test("a clean PNG comes back unchanged", () => {
    const src = png();
    expect(Array.from(stripImageMetadata(src, "image/png"))).toEqual(Array.from(src));
  });
});

// ── Failing closed ───────────────────────────────────────────────────────────

describe("stripImageMetadata fails closed", () => {
  test("an unsupported type is refused, never passed through", () => {
    expect(() => stripImageMetadata(bytes(0, 1, 2), "image/webp")).toThrow(UnsupportedImageError);
    expect(() => stripImageMetadata(bytes(0, 1, 2), "image/heic")).toThrow(UnsupportedImageError);
    expect(() => stripImageMetadata(bytes(0, 1, 2), "")).toThrow(UnsupportedImageError);
  });

  test("a file whose bytes contradict its declared type is refused", () => {
    expect(() => stripImageMetadata(png(), "image/jpeg")).toThrow(/Not a JPEG/);
    expect(() => stripImageMetadata(jpeg(), "image/png")).toThrow(/Not a PNG/);
  });

  test("truncated files are refused rather than half-copied", () => {
    const truncJpeg = jpeg({ exif: true }).subarray(0, 8);
    expect(() => stripImageMetadata(truncJpeg, "image/jpeg")).toThrow(UnsupportedImageError);
    const truncPng = png({ text: true }).subarray(0, 20);
    expect(() => stripImageMetadata(truncPng, "image/png")).toThrow(UnsupportedImageError);
  });

  test("a PNG chunk claiming a length past the end of the file is refused", () => {
    const src = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x7f, 0xff, 0xff, 0xff, // absurd length
      ...Array.from("IDAT").map((c) => c.charCodeAt(0)),
      1, 2, 3, 4,
    ]);
    expect(() => stripImageMetadata(src, "image/png")).toThrow(UnsupportedImageError);
  });

  test("empty input is refused", () => {
    expect(() => stripImageMetadata(new Uint8Array(0), "image/jpeg")).toThrow(UnsupportedImageError);
    expect(() => stripImageMetadata(new Uint8Array(0), "image/png")).toThrow(UnsupportedImageError);
  });
});

// ── Naming and paths ─────────────────────────────────────────────────────────

describe("mime allowlist", () => {
  test("JPEG and PNG only", () => {
    expect(isAllowedMediaMime("image/jpeg")).toBe(true);
    expect(isAllowedMediaMime("image/png")).toBe(true);
    expect(isAllowedMediaMime("image/webp")).toBe(false);
    expect(isAllowedMediaMime("image/heic")).toBe(false);
    expect(isAllowedMediaMime("application/pdf")).toBe(false);
  });
});

describe("safeMediaFilename", () => {
  test("strips directory components — no traversal reaches a storage path", () => {
    expect(safeMediaFilename("../../etc/passwd")).toBe("passwd");
    expect(safeMediaFilename("C:\\Users\\me\\kid.jpg")).toBe("kid.jpg");
  });

  test("replaces unsafe characters and leading dots", () => {
    expect(safeMediaFilename("my photo (1).JPG")).toBe("my-photo-1-.JPG");
    expect(safeMediaFilename(".hidden.png")).toBe("hidden.png");
  });

  test("never returns empty", () => {
    expect(safeMediaFilename("")).toBe("photo");
    expect(safeMediaFilename("///")).toBe("photo");
    expect(safeMediaFilename("!!!")).toBe("photo");
  });
});

describe("mediaStoragePath", () => {
  test("puts the org id first, so the storage policies can read it", () => {
    const p = mediaStoragePath("org-uuid", "story-uuid", "a.jpg");
    expect(p).toBe("org-uuid/story-uuid/a.jpg");
    expect(p.split("/")[0]).toBe("org-uuid");
  });
});
