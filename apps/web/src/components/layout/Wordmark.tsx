import { Link } from "react-router";
import { cn } from "../ui/cn";

export function Wordmark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-baseline font-display font-extrabold tracking-[-0.045em] text-ink",
        size === "lg" ? "text-3xl" : "text-[22px]",
        className,
      )}
      aria-label="Roomful home"
    >
      roomful
      <span className={cn("ml-0.5 inline-block rounded-full bg-accent", size === "lg" ? "size-2.5" : "size-2")} aria-hidden="true" />
    </Link>
  );
}
