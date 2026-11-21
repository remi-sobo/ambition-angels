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

/** The aria-describedby value for a control inside <Field htmlFor={id}>. */
export function fieldDescribedBy(
  id: string,
  { hint, error }: { hint?: ReactNode; error?: ReactNode },
): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

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
  // Stable ids for the help and error lines, so a control can point at them
  // with aria-describedby (see fieldDescribedBy and the *Field components in
  // ./Field). Derived from htmlFor; without one the lines simply have no id.
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className={TYPE.fieldLabel}>
        {label}
        {required ? (
          <span className="text-status-critical-text ml-0.5" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {/* §13: an error is a sentence, not just a red outline. */}
      {/* The hint stays visible next to an error: the error says what is wrong,
          the hint still says what belongs here. */}
      {hint ? (
        <p id={hintId} className={TYPE.metadata}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-status-critical-text">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Control height: `md` 36px (toolbars, dense forms), `lg` 44px (drawer and
 *  page forms, touch). */
export type ControlSize = "md" | "lg";
const HEIGHT: Record<ControlSize, string> = { md: "h-9", lg: "h-11" };

export default function Input({
  invalid,
  controlSize = "md",
  className = "",
  ...rest
}: { invalid?: boolean; controlSize?: ControlSize } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${CONTROL_BASE} ${HEIGHT[controlSize]} px-3 ${invalid ? INVALID : ""} ${className}`}
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
  controlSize = "md",
  className = "",
  children,
  ...rest
}: { invalid?: boolean; controlSize?: ControlSize } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      aria-invalid={invalid || undefined}
      // appearance-none + an inline chevron keeps the control identical across
      // browsers; the right padding reserves room for it.
      className={`${CONTROL_BASE} ${HEIGHT[controlSize]} pl-3 pr-9 appearance-none bg-no-repeat ${
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
