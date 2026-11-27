import type { Metadata } from "next";
import { bigShoulders, poppins, dmSans, instrumentSans } from "./fonts";
import "./globals.css";
import "./site.css";
import "./fonts/fallbacks.css";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import SiteChrome from "@/components/SiteChrome";
import DonateModalProvider from "@/components/DonateModalProvider";
import Analytics from "@/components/Analytics";

export const metadata: Metadata = {
  title: {
    default: "Ambition Angels | Career exposure students can actually use",
    template: "%s | Ambition Angels",
  },
  description:
    "Ambition helps schools and youth programs give students short career experiences, then turns what students explore into real conversations with trusted adults.",
  metadataBase: new URL("https://www.ambitionangels.org"),
  openGraph: {
    siteName: "Ambition Angels",
    type: "website",
  },
};

// Organization schema for Google's knowledge panel and nonprofit search results.
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "NGO",
  name: "Ambition Angels",
  url: "https://www.ambitionangels.org",
  logo: "https://www.ambitionangels.org/images/logo-color.png",
  description:
    "Ambition Angels helps schools and youth programs give students short career experiences called introships, then turns what students explore into real conversations with trusted adults.",
  email: "hello@ambitionangels.org",
  taxID: "87-2513010",
  nonprofitStatus: "Nonprofit501c3",
  address: {
    "@type": "PostalAddress",
    streetAddress: "380 Portage Ave",
    addressLocality: "Palo Alto",
    addressRegion: "CA",
    postalCode: "94306",
    addressCountry: "US",
  },
  sameAs: [
    "https://www.linkedin.com/company/ambition-angels",
    "https://www.youtube.com/@ambitionangels",
    "https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279",
    "https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${poppins.variable} ${dmSans.variable} ${instrumentSans.variable}`}>
      <body className="antialiased">
        <DonateModalProvider>
          {/* Org JSON-LD rides SiteChrome so standalone tenant surfaces
              (/admin — a shared BloomOS host) don't carry AA identity. */}
          <SiteChrome nav={<SiteHeader />} footer={<SiteFooter />} jsonLd={JSON.stringify(organizationSchema)}>
            {children}
          </SiteChrome>
        </DonateModalProvider>
        <Analytics />
      </body>
    </html>
  );
}
