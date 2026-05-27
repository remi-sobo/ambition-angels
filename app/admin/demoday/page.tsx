import type { Metadata } from "next";
import DemoDayTracker from "./DemoDayTracker";

export const metadata: Metadata = { title: "Demo Day" };

export default function DemoDayPage() {
  return <DemoDayTracker />;
}
