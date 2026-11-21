import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import Input, { Field, Select, Textarea, Checkbox, fieldDescribedBy, type ControlSize } from "./Input";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The V4 field family (spec §6 "Field: input, select, textarea, date, each with
 * a label and error line"). Each one is <Field> + the matching control from
 * ./Input, wired so assistive tech gets the whole story:
 *
 *  - the label is a real <label for>, never a placeholder
 *  - hint and error lines are linked with aria-describedby
 *  - an error sets aria-invalid and reads as a sentence, not just a red border
 *  - `required` sets the native attribute (announced) plus the visible marker
 *
 * Controls default to the 44px `lg` height used by drawer and page forms
 * (GiftFlow.dc.html); pass controlSize="md" for a dense 36px form.
 *
 *   <TextField label="Amount" required inputMode="decimal" />
 *   <SelectField label="Fund" hint="Filled in from the ask" options={[...]} />
 *   <DateField label="Date" error="Pick a date on or before today." />
 */

type FieldBits = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Wrapper class (grid placement and the like). */
  className?: string;
};

function useFieldId(id?: string): string {
  const auto = useId();
  return id ?? `f${auto.replace(/:/g, "")}`;
}

export function TextField({
  label,
  hint,
  error,
  required,
  className,
  id,
  controlSize = "lg",
  ...rest
}: FieldBits & { controlSize?: ControlSize } & Omit<InputHTMLAttributes<HTMLInputElement>, "required">) {
  const fid = useFieldId(id);
  return (
    <Field label={label} htmlFor={fid} hint={hint} error={error} required={required} className={className}>
      <Input
        id={fid}
        required={required}
        invalid={!!error}
        controlSize={controlSize}
        aria-describedby={fieldDescribedBy(fid, { hint, error })}
        {...rest}
      />
    </Field>
  );
}

export function DateField(
  props: FieldBits & { controlSize?: ControlSize } & Omit<InputHTMLAttributes<HTMLInputElement>, "required" | "type">,
) {
  // The native date control: keyboard and screen-reader support for free,
  // and the phone's own picker on touch.
  return <TextField type="date" {...props} />;
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  id,
  options,
  placeholder,
  controlSize = "lg",
  children,
  ...rest
}: FieldBits & {
  controlSize?: ControlSize;
  /** Options as data; or pass <option> children instead. */
  options?: SelectOption[];
  /** A first, empty option ("Choose a fund"). */
  placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "required">) {
  const fid = useFieldId(id);
  return (
    <Field label={label} htmlFor={fid} hint={hint} error={error} required={required} className={className}>
      <Select
        id={fid}
        required={required}
        invalid={!!error}
        controlSize={controlSize}
        aria-describedby={fieldDescribedBy(fid, { hint, error })}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </Select>
    </Field>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  required,
  className,
  id,
  rows = 4,
  ...rest
}: FieldBits & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "required">) {
  const fid = useFieldId(id);
  return (
    <Field label={label} htmlFor={fid} hint={hint} error={error} required={required} className={className}>
      <Textarea
        id={fid}
        rows={rows}
        required={required}
        invalid={!!error}
        aria-describedby={fieldDescribedBy(fid, { hint, error })}
        {...rest}
      />
    </Field>
  );
}

/**
 * A checkbox with its label to the right and an optional description under
 * it, as a whole-row click target (GiftFlow "Counts toward ask").
 */
export function CheckboxField({
  label,
  hint,
  error,
  required,
  className = "",
  id,
  ...rest
}: FieldBits & Omit<InputHTMLAttributes<HTMLInputElement>, "required" | "type">) {
  const fid = useFieldId(id);
  const describedBy = fieldDescribedBy(fid, { hint, error });
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={fid} className="flex items-start gap-3 min-h-[24px] cursor-pointer">
        <Checkbox
          id={fid}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="mt-0.5 shrink-0"
          {...rest}
        />
        <span className="min-w-0">
          <span className={`${TYPE.body} font-medium`}>
            {label}
            {required ? (
              <span className="text-status-critical-text ml-0.5" aria-hidden>
                *
              </span>
            ) : null}
          </span>
          {hint ? (
            <span id={`${fid}-hint`} className={`block ${TYPE.metadata} mt-0.5`}>
              {hint}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p id={`${fid}-error`} className="text-xs font-medium text-status-critical-text pl-7">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
