import type { Metadata } from "next";
import AssessClient from "./AssessClient";

export const metadata: Metadata = {
  title: "The Assessment — What Are You Built For",
  robots: { index: false, follow: false },
};

export default function AssessPage() {
  return <AssessClient />;
}
