import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, trailing, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink-2">
        {label}
      </label>
      <div
        className={cn(
          "flex h-13 items-center rounded-md border bg-card px-3.5 transition-colors focus-within:border-ink",
          error ? "border-imposter" : "border-line-strong",
        )}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${inputId}-msg` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
          {...rest}
        />
        {trailing}
      </div>
      {(error || hint) && (
        <p id={`${inputId}-msg`} className={cn("mt-1.5 text-sm", error ? "text-imposter" : "text-muted")}>
          {error || hint}
        </p>
      )}
    </div>
  );
});
