import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useCopy } from "../../hooks/use-copy";

export function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function RoomCodeCard({ code }: { code: string }) {
  const codeCopy = useCopy();
  const linkCopy = useCopy();
  const link = `${location.origin}/r/${code}`;
  const canShare = typeof navigator.share === "function";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Room code</div>
          <button
            onClick={() => codeCopy.copy(code)}
            className="mt-0.5 -ml-1 rounded-md px-1 font-mono text-[40px] leading-tight font-semibold tracking-[0.04em] whitespace-nowrap text-ink active:bg-sunk"
            aria-label={`Room code ${code.split("").join(" ")}. Tap to copy`}
          >
            {formatCode(code)}
          </button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => codeCopy.copy(code)}
          icon={codeCopy.copied ? <Check className="size-4 text-crew" /> : <Copy className="size-4" />}
          aria-live="polite"
        >
          {codeCopy.copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-ink-2">Friends join at this site with the code, or open your invite link.</p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="ink"
          block
          icon={linkCopy.copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
          onClick={async () => {
            if (canShare) {
              try {
                await navigator.share({ title: "Join my Roomful room", text: `Join my room: ${formatCode(code)}`, url: link });
                return;
              } catch {
                /* cancelled or unsupported: fall back to copy */
              }
            }
            await linkCopy.copy(link);
          }}
        >
          {linkCopy.copied ? "Invite link copied" : canShare ? "Share invite" : "Copy invite link"}
        </Button>
      </div>
    </Card>
  );
}
