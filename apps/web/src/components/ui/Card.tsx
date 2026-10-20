import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-card shadow-card", className)} {...rest} />;
}

export function SectionLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "crew" | "imposter" | "warn" | "ink";
  className?: string;
}) {
  const tones = {
    neutral: "bg-sunk text-ink-2",
    accent: "bg-accent-soft text-accent-ink",
    crew: "bg-crew-soft text-crew",
    imposter: "bg-imposter-soft text-imposter",
    warn: "bg-warn-soft text-warn",
    ink: "bg-ink text-paper",
  } as const;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
