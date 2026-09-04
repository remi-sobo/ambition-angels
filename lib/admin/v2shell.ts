import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Spec B, stage B3 — the V2 shell flag. PER-USER (open decision 1, resolved
 * as recommended): profiles.v2_shell, so Remi and Shannon can run V2 on every
 * device while external tenants stay on V1. Flipped at /admin/v2 (writes
 * through the session client; profiles RLS already restricts writes to the
 * user's own row).
 *
 * Error-tolerant BY DESIGN: the column ships in an unapplied migration
 * (spec_b_v2_shell_flag.sql), and until it is applied this read fails and
 * returns false — every user simply keeps V1. The flag can never break
 * sign-in or the V1 chrome.
 */
export const getV2ShellEnabled = cache(async (): Promise<boolean> => {
  const ctx = await getOrgContext();
  if (!ctx) return false;
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .select("v2_shell")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) return false; // column not applied yet → V1
    return data?.v2_shell === true;
  } catch {
    return false;
  }
});
