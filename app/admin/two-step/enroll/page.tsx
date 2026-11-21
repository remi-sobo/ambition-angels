import type { Metadata } from "next";
import { safeTwoStepNext } from "@/lib/auth/twoStep";
import EnrollScreen from "./EnrollScreen";

// Two-step login, first time (pre-SafeSpace item D). Middleware sends every
// signed-in session with no verified factor here, from any /admin or /board
// page; ?next is where it was headed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up two-step login" };

export default function Page({ searchParams }: { searchParams?: { next?: string } }) {
  return <EnrollScreen next={safeTwoStepNext(searchParams?.next)} />;
}
