"use client";

import { useState } from "react";
import type { AdminUser } from "@/lib/admin/auth";
import Button from "@/app/admin/_components/ui/Button";
import QuickAddModal from "@/app/admin/_components/QuickAddModal";

/**
 * The Tasks page's one primary action (V4 Stage G). Opens the same quick-add
 * form the shell's "+" opens, so there is one way to create a task.
 */
export default function NewTaskButton({ currentUser }: { currentUser: AdminUser | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New task
      </Button>
      {open ? <QuickAddModal currentUser={currentUser} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
