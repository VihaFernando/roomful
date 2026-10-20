import { useEffect, useState } from "react";
import { cn } from "./cn";

/** Milliseconds left until a server-clock deadline, ticking 4×/s. */
export function useRemaining(endsAt: number | null, clockOffset: number): number | null {
  const calc = () => (endsAt === null ? null : Math.max(0, endsAt - (Date.now() + clockOffset)));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (endsAt === null) return;
    const t = window.setInterval(() => setLeft(calc()), 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, clockOffset]);
  return left;
}

/** Compact countdown chip. Turns orange in the last 5 seconds; never pulses. */
export function Countdown({ endsAt, clockOffset, className }: { endsAt: number | null; clockOffset: number; className?: string }) {
  const left = useRemaining(endsAt, clockOffset);
  if (left === null) return null;
  const secs = Math.ceil(left / 1000);
  const urgent = secs <= 5;
  return (
    <span
      className={cn(
        "inline-flex h-8 min-w-14 items-center justify-center gap-1 rounded-md border px-2 font-mono text-[15px] font-semibold tabular",
        urgent ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong bg-card text-ink",
        className,
      )}
      role="timer"
      aria-label={`${secs} seconds left`}
    >
      {secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : `${secs}s`}
    </span>
  );
}

/** Thin progress bar for a phase timer. */
export function TimerBar({ endsAt, totalMs, clockOffset }: { endsAt: number | null; totalMs: number; clockOffset: number }) {
  const left = useRemaining(endsAt, clockOffset);
  if (left === null) return <div className="h-1" />;
  const pct = Math.max(0, Math.min(100, (left / totalMs) * 100));
  return (
    <div className="h-1 w-full overflow-hidden bg-sunk" aria-hidden="true">
      <div
        className={cn("h-full transition-[width] duration-300 ease-linear", left <= 5000 ? "bg-accent" : "bg-ink")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
