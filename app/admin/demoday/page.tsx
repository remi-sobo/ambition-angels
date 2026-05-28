import type { Metadata } from "next";
import DemoDayTabs from "./DemoDayTabs";

export const metadata: Metadata = { title: "Demo Day" };

export default function DemoDayPage() {
  return <DemoDayTabs />;
}
