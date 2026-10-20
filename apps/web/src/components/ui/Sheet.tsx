import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Bottom sheet on phones, centered panel on wider screens.
 * Built on Radix Dialog for focus trapping, escape and screen reader support.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/35 data-[state=open]:animate-[enter_140ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-xl border border-line bg-paper shadow-lift outline-none",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(520px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
            "data-[state=open]:animate-enter",
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4 px-5 pt-3 pb-2 sm:pt-5">
            <div>
              <Dialog.Title className="font-display text-xl font-bold tracking-[-0.02em]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted active:bg-sunk"
              aria-label="Close"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer ? <div className="border-t border-line px-5 pt-3 pb-safe">{footer}</div> : <div className="pb-safe" />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
