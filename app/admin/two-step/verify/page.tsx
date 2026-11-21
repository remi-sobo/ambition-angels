import type { Metadata } from "next";
import { safeTwoStepNext } from "@/lib/auth/twoStep";
import VerifyScreen from "./VerifyScreen";

// Two-step login, every sign-in (pre-SafeSpace item D). Middleware sends every
// signed-in session that has a factor but is still at aal1 here.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Two-step login" };

export default function Page({ searchParams }: { searchParams?: { next?: string } }) {
  return <VerifyScreen next={safeTwoStepNext(searchParams?.next)} />;
}
