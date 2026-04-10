import type { Metadata } from "next";
import { Big_Shoulders_Display, Poppins, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import GiveButterWidget from "@/components/GiveButterWidget";

const bigShoulders = Big_Shoulders_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ambition Angels | Freshman Year to Career",
    template: "%s | Ambition Angels",
  },
  description:
    "Ambition Angels delivers real career internships to teens on the phones they already have. Free for every student. Backed by real rewards.",
  metadataBase: new URL("https://www.ambitionangels.org"),
  openGraph: {
    siteName: "Ambition Angels",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${poppins.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        <Nav />
        <main>{children}</main>
        <Footer />
        {/* GiveButter: element must exist before script runs */}
        <GiveButterWidget />
        <Script
          src="https://widgets.givebutter.com/latest.umd.cjs?acct=67420"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
