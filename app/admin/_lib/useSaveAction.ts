"use client";

import { useCallback } from "react";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { saveAction, type SaveActionOptions, type SaveResult } from "@/lib/admin/saveAction";

/**
 * saveAction bound to the admin toast layer, for client components:
 *
 *   const save = useSaveAction();
 *   const r = await save({ request: { url, method: "PATCH", body }, rollback });
 *
 * See lib/admin/saveAction.ts for the contract (never throws; rollback on any
 * failure; never optimistic on money writes).
 */
export function useSaveAction() {
  const toast = useToast();
  return useCallback(
    <T = unknown>(opts: Omit<SaveActionOptions<T>, "toast">): Promise<SaveResult<T>> => saveAction<T>({ ...opts, toast }),
    [toast],
  );
}
