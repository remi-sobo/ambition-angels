import type { Metadata } from "next";
import HostClient from "./HostClient";

export const metadata: Metadata = {
  title: "Host a Room — What Are You Built For",
  robots: { index: false, follow: false },
};

export default function HostPage() {
  return <HostClient />;
}
