import { useRef, useState } from "react";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, normalizeRoomCode } from "@party/shared";
import { cn } from "./cn";

const ALLOWED = new Set(ROOM_CODE_ALPHABET);

/** Uppercases, drops separators and characters that never appear in codes. */
export function cleanCode(raw: string): string {
  return [...normalizeRoomCode(raw)].filter((ch) => ALLOWED.has(ch)).join("").slice(0, ROOM_CODE_LENGTH);
}

/**
 * Six-cell room code input backed by a single real <input> so paste,
 * autofill, screen readers and mobile keyboards all behave normally.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const set = (raw: string) => {
    const next = cleanCode(raw);
    onChange(next);
    if (next.length === ROOM_CODE_LENGTH && next !== value) onComplete?.(next);
  };
  const active = Math.min(value.length, ROOM_CODE_LENGTH - 1);

  return (
    <div className="relative">
      <input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => set(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          set(e.clipboardData.getData("text"));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length === ROOM_CODE_LENGTH) onComplete?.(value);
        }}
        inputMode="text"
        enterKeyHint="go"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={ROOM_CODE_LENGTH + 6}
        aria-label="Room code, 6 characters"
        aria-invalid={invalid || undefined}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-[repeat(3,1fr)_8px_repeat(3,1fr)] gap-1.5" aria-hidden="true">
        {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => {
          const ch = value[i] ?? "";
          const isActive = focused && i === active;
          return [
            i === 3 ? <div key="gap" /> : null,
            <div
              key={i}
              className={cn(
                "flex h-16 items-center justify-center rounded-md border bg-card font-mono text-[26px] font-semibold text-ink transition-[border-color,box-shadow] duration-100",
                invalid ? "border-imposter" : isActive ? "border-ink ring-1 ring-ink" : "border-line-strong",
              )}
            >
              {ch || <span className={cn("h-0.5 w-4 rounded", isActive ? "bg-ink" : "bg-line-strong")} />}
            </div>,
          ];
        })}
      </div>
    </div>
  );
}
