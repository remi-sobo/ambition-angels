"use client";

import { createContext, useContext } from "react";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Who's currently using BloomOS, made available to any client component without
 * prop-drilling. Set once at the admin layout from the server-resolved user.
 *
 * Used to scope owner-only affordances — notably the Claude Code prompt:
 * everyone goes through the report interview, but only the org owner ever
 * sees/copies the synthesized prompt. `useIsOwner()` is the single check,
 * keyed on the membership ROLE (not a hardcoded name) so it holds on every
 * tenant.
 */
type AdminUserValue = { user: AdminUser | null; isOwner: boolean };

const AdminUserContext = createContext<AdminUserValue>({ user: null, isOwner: false });

export function AdminUserProvider({
  value,
  children,
}: {
  value: AdminUserValue;
  children: React.ReactNode;
}) {
  return <AdminUserContext.Provider value={value}>{children}</AdminUserContext.Provider>;
}

export function useAdminUser(): AdminUser | null {
  return useContext(AdminUserContext).user;
}

/** Owner = the org membership's `owner` role. Gates the prompt copy/reveal. */
export function useIsOwner(): boolean {
  return useContext(AdminUserContext).isOwner;
}
