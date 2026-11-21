"use client";

import { TextField } from "@/app/admin/_components/ui/Field";

export function isSixDigits(v: string): boolean {
  return /^\d{6}$/.test(v);
}

/** The 6-digit authenticator code: numeric keypad on phones, one-time-code
 *  autofill, digits only (spaces and dashes from a paste are dropped). */
export default function CodeField({
  value,
  onChange,
  error,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  return (
    <TextField
      label="6-digit code"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      placeholder="123456"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      error={error ?? undefined}
      className="max-w-[12rem]"
      required
    />
  );
}
