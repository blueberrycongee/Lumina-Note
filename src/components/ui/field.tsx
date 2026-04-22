import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Field — the atomic form row: label · control · (hint or error).
 *
 * Used inside <Dialog> for settings, and anywhere a form input needs a
 * labeled pattern. The `control` slot takes the actual input/select/etc.;
 * the Field only owns layout, label, hint, and error messaging.
 */

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** The actual input/select/textarea/checkbox. Use render-prop shape so
   *  we can pass the generated id through for label association. */
  children: (controlId: string) => ReactNode;
  /** Put control right of label instead of below. For toggles/selects. */
  inline?: boolean;
  className?: string;
}

export function Field({
  label,
  hint,
  error,
  children,
  inline,
  className,
}: FieldProps) {
  const controlId = useId();
  const hintId = hint || error ? `${controlId}-hint` : undefined;

  if (inline) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 py-1.5",
          className,
        )}
      >
        <div className="min-w-0 flex-1">
          <label
            htmlFor={controlId}
            className="block text-sm font-medium text-foreground"
          >
            {label}
          </label>
          {(hint || error) && !error ? (
            <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
          {error ? (
            <p id={hintId} className="mt-0.5 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">{children(controlId)}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={controlId}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      {children(controlId)}
      {error ? (
        <p id={hintId} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * TextInput — the canonical text input styling. Use inside a Field.
 */
export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
}

export function TextInput({
  invalid,
  className,
  ...props
}: TextInputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-ui-md border bg-background px-3 py-2",
        "text-sm text-foreground",
        "placeholder:text-muted-foreground/70",
        "transition-colors duration-fast ease-out-subtle",
        invalid
          ? "border-destructive/70 focus-visible:border-destructive"
          : "border-border focus-visible:border-primary/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Toggle — simple boolean switch. Inline-safe inside Field.
 */
export interface ToggleProps {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string; // accessibility only — Field provides the visible label
}

export function Toggle({ id, checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full",
        "transition-colors duration-fast ease-out-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "bg-primary" : "bg-muted",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-popover shadow-elev-1",
          "transition-transform duration-fast ease-out-subtle",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
