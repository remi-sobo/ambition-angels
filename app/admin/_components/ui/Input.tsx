import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Form controls for BloomOS — Visual System V3 §4 and §13.
 *
 * "Inputs: radius 8-10px, neutral border, strong visible focus state."
 *
 * The focus state is the important half. Before this, inputs inherited the
 * page's focus ring and a terracotta border that was easy to miss on a warm
 * background; here focus is unmistakable — the border goes terracotta AND a
 * 3px halo appears — which is what §13's "obvious keyboard focus states" asks
 * for. Disabled and invalid states are also carried by more than color.
 */

const CONTROL_BASE = `w-full rounded-control bg-surface border border-hairline ${TYPE.body} placeholder:text-ink-3 transition-colors
  hover:border-outline
  focus:outline-none focus:border-orange focus:ring-[3px] focus:ring-orange/20
  disabled:bg-tile disabled:text-ink-3 disabled:cursor-not-allowed`;

const INVALID = "border-status-critical focus:border-status-critical focus:ring-status-critical/20";

/** Label + control + help/error, laid out identically everywhere. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = "",
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-1">
        {label}
        {required ? (
          <span className="text-status-critical-text ml-0.5" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {/* §13: an error is a sentence, not just a red outline. */}
      {error ? (
        <p className="text-xs font-medium text-status-critical-text">{error}</p>
      ) : hint ? (
        <p className={TYPE.metadata}>{hint}</p>
      ) : null}
    </div>
  );
}

export default function Input({
  invalid,
  className = "",
  ...rest
}: { invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${CONTROL_BASE} h-9 px-3 ${invalid ? INVALID : ""} ${className}`}
      {...rest}
    />
  );
}

export function Textarea({
  invalid,
  className = "",
  ...rest
}: { invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`${CONTROL_BASE} px-3 py-2 leading-relaxed ${invalid ? INVALID : ""} ${className}`}
      {...rest}
    />
  );
}

export function Select({
  invalid,
  className = "",
  children,
  ...rest
}: { invalid?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      aria-invalid={invalid || undefined}
      // appearance-none + an inline chevron keeps the control identical across
      // browsers; the right padding reserves room for it.
      className={`${CONTROL_BASE} h-9 pl-3 pr-9 appearance-none bg-no-repeat ${
        invalid ? INVALID : ""
      } ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23746C63' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M4 6.5L8 10.5L12 6.5'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 10px center",
        backgroundSize: "16px 16px",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Checkbox / radio, sized to a real touch target and accent-tinted. */
export function Checkbox({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={`w-4 h-4 rounded-[4px] border-outline text-orange accent-[color:var(--accent-ink)] focus:ring-[3px] focus:ring-orange/20 ${className}`}
      {...rest}
    />
  );
}
