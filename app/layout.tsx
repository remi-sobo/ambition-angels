import type { Metadata } from "next";
import { bigShoulders, poppins, dmSans, instrumentSans } from "./fonts";
import "./globals.css";
import "./fonts/fallbacks.css";
import MainLandmark from "@/components/MainLandmark";

// BloomOS serves only the app (app.bloomos.org): admin, board portal,
// meeting scheduler, Strategy Room and coach links. Each section sets its
// own title; nothing here is meant for search engines.
export const metadata: Metadata = {
  title: "BloomOS",
  description: "BloomOS: the operating system for your nonprofit.",
  metadataBase: new URL("https://app.bloomos.org"),
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${poppins.variable} ${dmSans.variable} ${instrumentSans.variable}`}>
      <body className="antialiased">
        <MainLandmark>{children}</MainLandmark>
      </body>
    </html>
  );
}
