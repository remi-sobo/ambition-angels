"use client";

import { createContext, useContext } from "react";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Who's currently using BloomOS, made available to any client component without
 * prop-drilling. Set once at the admin layout from the server-resolved user.
 *
 * Used to scope owner-only affordances — notably the Claude Code prompt:
 * everyone goes through the report interview, but only the owner (Remi) ever
 * sees/copies the synthesized prompt. `useIsOwner()` is the single check.
 */
const AdminUserContext = createContext<AdminUser | null>(null);

export function AdminUserProvider({
  value,
  children,
}: {
  value: AdminUser | null;
  children: React.ReactNode;
}) {
  return <AdminUserContext.Provider value={value}>{children}</AdminUserContext.Provider>;
}

export function useAdminUser(): AdminUser | null {
  return useContext(AdminUserContext);
}

/** Owner = Remi. The prompt copy/reveal is gated to the owner only. */
export function useIsOwner(): boolean {
  return useContext(AdminUserContext) === "remi";
}
