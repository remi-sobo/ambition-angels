import localFont from "next/font/local";

// Self-hosted copies of the Google Fonts files (latin subset, woff2) so builds
// never download from Google. Options mirror the old next/font/google calls:
// same weights, styles, CSS variables and display. Licenses (SIL OFL 1.1) sit
// next to each family's files. next/font needs literal option values, so the
// latin unicode-range Google serves with these files is repeated per call.

// Variable file (wght 100-900), limited to the 400-900 range used before.
// adjustFontFallback is off because next/font/local would measure the file's
// default instance (wght 100) and undersize the fallback. The fallback face
// with Google's precalculated metrics lives in ./fallbacks.css instead.
export const bigShoulders = localFont({
  src: "./big-shoulders-display/BigShouldersDisplay-latin-wght.woff2",
  weight: "400 900",
  style: "normal",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Big Shoulders Display Fallback"],
});

export const poppins = localFont({
  src: [
    { path: "./poppins/Poppins-latin-400.woff2", weight: "400" },
    { path: "./poppins/Poppins-latin-500.woff2", weight: "500" },
    { path: "./poppins/Poppins-latin-600.woff2", weight: "600" },
    { path: "./poppins/Poppins-latin-700.woff2", weight: "700" },
    { path: "./poppins/Poppins-latin-800.woff2", weight: "800" },
  ],
  style: "normal",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-heading",
  display: "swap",
});

// Variable file (wght 100-1000), the full range next/font/google requested.
export const dmSans = localFont({
  src: "./dm-sans/DMSans-latin-wght.woff2",
  weight: "100 1000",
  style: "normal",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
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
  src: "./instrument-sans/InstrumentSans-latin-wght.woff2",
  weight: "400 700",
  style: "normal",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-instrument",
  display: "swap",
});
