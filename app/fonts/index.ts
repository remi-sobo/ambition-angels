import localFont from "next/font/local";

// Self-hosted fonts so builds never download from Google. Files are the full
// upstream TTFs from github.com/google/fonts compressed to woff2 (every glyph,
// not just latin, so names with characters like ā, ő or ł render in the real
// face). DM Sans is pinned to opsz 14 and Instrument Sans to wdth 100, the
// instances Google served. Options mirror the old next/font/google calls:
// same weights, styles, CSS variables and display. Licenses (SIL OFL 1.1) sit
// next to each family's files.

// Variable file (wght 100-900), limited to the 400-900 range used before.
// adjustFontFallback is off because next/font/local would measure the file's
// default instance (wght 100) and undersize the fallback. The fallback face
// with Google's precalculated metrics lives in ./fallbacks.css instead.
export const bigShoulders = localFont({
  src: "./big-shoulders-display/BigShouldersDisplay-wght.woff2",
  weight: "400 900",
  style: "normal",
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Big Shoulders Display Fallback"],
});

export const poppins = localFont({
  src: [
    { path: "./poppins/Poppins-400.woff2", weight: "400" },
    { path: "./poppins/Poppins-500.woff2", weight: "500" },
    { path: "./poppins/Poppins-600.woff2", weight: "600" },
    { path: "./poppins/Poppins-700.woff2", weight: "700" },
    { path: "./poppins/Poppins-800.woff2", weight: "800" },
  ],
  style: "normal",
  variable: "--font-heading",
  display: "swap",
});

// Variable file (wght 100-1000), the full range next/font/google requested.
export const dmSans = localFont({
  src: "./dm-sans/DMSans-wght.woff2",
  weight: "100 1000",
  style: "normal",
  variable: "--font-body",
  display: "swap",
});

// BloomOS (admin) interface face — Visual System V3 §2. ONE face for the whole
// product UI: headings, body, navigation, buttons, labels. Scoped to
// `.admin-shell` in globals.css so the public Ambition Angels site keeps Big
// Shoulders / Poppins / DM Sans untouched. The BloomOS wordmark stays an image
// asset and is deliberately NOT matched to this face.
// Variable file (wght 400-700).
export const instrumentSans = localFont({
  src: "./instrument-sans/InstrumentSans-wght.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-instrument",
  display: "swap",
});
