import { cn } from "./cn";

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string; tone: "info" | "error" }[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)]"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={cn(
            "pointer-events-auto w-full max-w-sm animate-enter rounded-md border px-4 py-3 text-left text-sm font-medium shadow-lift",
            t.tone === "error" ? "border-imposter/30 bg-imposter-soft text-imposter" : "border-ink bg-ink text-paper",
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
