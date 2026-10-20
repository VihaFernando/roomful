import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { cn } from "../ui/cn";
import { Wordmark } from "./Wordmark";

/** Simple top-level page frame for non-room screens. */
export function PageShell({
  children,
  back,
  right,
  className,
}: {
  children: ReactNode;
  back?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col pt-safe">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-safe">
        <div className="flex items-center gap-1">
          {back && (
            <Link to={back} className="-ml-2 flex size-11 items-center justify-center rounded-md active:bg-sunk" aria-label="Back">
              <ArrowLeft className="size-5" />
            </Link>
          )}
          <Wordmark />
        </div>
        {right}
      </header>
      <main className={cn("mx-auto flex w-full max-w-5xl flex-1 flex-col px-safe pb-safe", className)}>{children}</main>
    </div>
  );
}
