import type { ReactNode } from "react";
import { cn } from "./cn";

/** Empty / error / closed states share one layout so they feel like part of the product. */
export function StatePanel({
  icon,
  title,
  body,
  actions,
  tone = "neutral",
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  tone?: "neutral" | "error";
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <div
          className={cn(
            "mb-5 flex size-14 items-center justify-center rounded-lg border",
            tone === "error" ? "border-imposter/25 bg-imposter-soft text-imposter" : "border-line bg-card text-ink",
          )}
        >
          {icon}
        </div>
      )}
      <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-balance">{title}</h1>
      {body && <div className="mt-2 text-[15px] text-ink-2 text-pretty">{body}</div>}
      {actions && <div className="mt-7 flex w-full flex-col gap-2.5">{actions}</div>}
    </div>
  );
}
