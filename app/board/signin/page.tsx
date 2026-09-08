import type { Metadata } from "next";
import SignInForm from "./SignInForm";
import { C, F } from "../_components/tokens";

export const metadata: Metadata = {
  title: "Sign in · Ambition Angels Board",
  robots: { index: false, follow: false },
};

/**
 * Sign in (spec §5.1). Single centered card on cream. No marketing, no
 * imagery, no navigation.
 */
export default function BoardSignInPage({
  searchParams,
}: {
  searchParams: { next?: string; auth_error?: string };
}) {
  // Only same-origin board paths survive: ?next is attacker-controllable, and
  // it is handed to Supabase as part of the post-auth destination.
  const raw = searchParams.next ?? "";
  const next =
    raw.startsWith("/board") && !raw.startsWith("//") ? raw : "/board";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: C.cream,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo-color.png"
        alt="Ambition Angels"
        style={{ height: 48, width: "auto", display: "block" }}
      />

      <SignInForm next={next} expired={searchParams.auth_error === "1"} />

      <p
        style={{
          margin: "28px 0 0",
          fontSize: 15,
          lineHeight: 1.6,
          color: C.muted,
          textAlign: "center",
          maxWidth: 400,
          fontFamily: F.body,
        }}
      >
        This area is private and for directors of Ambition Angels Inc.
      </p>
    </div>
  );
}
