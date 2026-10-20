import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ink";
type Size = "md" | "lg" | "sm" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white border border-accent-press/40 shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] active:bg-accent-press disabled:bg-sunk disabled:text-muted disabled:border-line disabled:shadow-none",
  ink: "bg-ink text-paper border border-ink shadow-[inset_0_-2px_0_rgb(255_255_255/0.08)] active:bg-ink-2 disabled:bg-sunk disabled:text-muted disabled:border-line",
  secondary:
    "bg-card text-ink border border-line-strong shadow-card active:bg-sunk disabled:text-muted disabled:bg-sunk/60",
  ghost: "bg-transparent text-ink-2 border border-transparent active:bg-sunk disabled:text-muted",
  danger: "bg-card text-imposter border border-imposter/30 active:bg-imposter-soft disabled:text-muted",
};

const sizes: Record<Size, string> = {
  sm: "h-10 px-3.5 text-sm gap-1.5 rounded-md",
  md: "h-12 px-5 text-[15px] gap-2 rounded-md",
  lg: "h-14 px-6 text-base gap-2.5 rounded-lg",
  icon: "h-11 w-11 rounded-md",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-semibold tracking-[-0.01em] whitespace-nowrap",
        "transition-[background-color,transform,color] duration-100 active:translate-y-px disabled:active:translate-y-0",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});
