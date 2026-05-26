import YGBPage from "./YGBPage";

// Own metadata so the page (and shared links) read as YGB Creators Camp, not
// the Ambition Angels site. `title.absolute` skips the root "%s | Ambition
// Angels" template. The crown favicon lives in app/ygb/icon.png and the share
// image in app/ygb/opengraph-image.jpg (both auto-wired by Next).
export const metadata = {
  title: { absolute: "YGB Creators Camp 2026" },
  description:
    "Young. Gifted. Black. A free 5-day creators camp in East Palo Alto where kids use real AI tools to make a song, art, stories, and their own brand. August 3 to 7, 2026. 20 spots.",
  openGraph: {
    title: "YGB Creators Camp 2026",
    description:
      "Free 5-day camp in East Palo Alto. Kids create a song, art, and their own brand with real AI tools. August 3 to 7, 2026. 20 spots.",
    siteName: "YGB Creators Camp",
    type: "website",
    url: "/ygb",
  },
  twitter: {
    card: "summary_large_image",
    title: "YGB Creators Camp 2026",
    description:
      "Free 5-day camp in East Palo Alto. Kids create with real AI tools. August 3 to 7, 2026. 20 spots.",
  },
};

// Returning families get the private link /ygb?early=true. We read the param
// on the server so earlyAccess is known before the client form computes its
// initial state (the form seeds returning_family / early_access from it).
export default function Page({ searchParams }) {
  const earlyAccess = searchParams?.early === "true";
  return <YGBPage earlyAccess={earlyAccess} />;
}
