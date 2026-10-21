import { useEffect, useState, type ReactNode } from "react";
import { Check, Eye, EyeOff, Minus } from "lucide-react";
import type { ImposterClue } from "@party/shared/games/imposter";
import { cn } from "../../../components/ui/cn";
import { Avatar } from "../../players/avatars";
import { useImposter } from "./use-imposter";

export function PlayerTag({ id, size = "sm", you, className }: { id: string; size?: "xs" | "sm" | "md"; you?: boolean; className?: string }) {
  const { players, me } = useImposter();
  const p = players.get(id);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar id={p.avatarId} size={size} dimmed={p.presence === "gone"} />
      <span className="truncate font-semibold">
        {p.nickname}
        {(you ?? id === me) && <span className="ml-1 font-normal text-muted">(you)</span>}
      </span>
    </span>
  );
}

/** Horizontal turn order with done / current / upcoming states. */
export function TurnStrip() {
  const { pub, players } = useImposter();
  const roundClues = pub.clues.filter((c) => c.cycle === pub.cycle && c.round === pub.clueRound);
  const doneIds = new Map(roundClues.map((c) => [c.playerId, c.text]));
  return (
    <ol className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1" aria-label="Turn order">
      {pub.turnOrder.map((id, i) => {
        const p = players.get(id);
        const current = id === pub.currentTurnId;
        const done = doneIds.has(id);
        const out = !pub.participants.find((x) => x.id === id)?.alive;
        return (
          <li key={id} className="flex w-14 shrink-0 flex-col items-center gap-1" aria-current={current ? "step" : undefined}>
            <span className={cn("relative rounded-md p-0.5", current ? "ring-2 ring-accent" : "ring-1 ring-transparent")}>
              <Avatar id={p.avatarId} size="md" dimmed={out || (done && !current)} />
              {done && (
                <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-paper bg-ink text-paper">
                  {doneIds.get(id) === null ? <Minus className="size-3" /> : <Check className="size-3" />}
                </span>
              )}
            </span>
            <span className={cn("w-full truncate text-center text-xs", current ? "font-bold text-ink" : "text-muted")}>
              {current ? "Now" : `${i + 1}. ${p.nickname}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ClueCard({ clue, showAvatar, emphasis }: { clue: ImposterClue; showAvatar: boolean; emphasis?: boolean }) {
  const { players, me } = useImposter();
  const p = players.get(clue.playerId);
  return (
    <li
      className={cn(
        "flex animate-enter items-center gap-3 rounded-md border bg-card px-3 py-2.5",
        emphasis ? "border-ink" : "border-line",
      )}
    >
      {showAvatar && <Avatar id={p.avatarId} size="sm" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-muted">
          {p.nickname}
          {clue.playerId === me && " (you)"}
        </div>
        {clue.text === null ? (
          <div className="text-[15px] text-muted italic">Ran out of time</div>
        ) : (
          <div className="break-words font-display text-lg leading-snug font-semibold">{clue.text}</div>
        )}
      </div>
    </li>
  );
}

export function ClueList({
  clues,
  emptyLabel,
  highlightLatest = true,
}: {
  clues: ImposterClue[];
  emptyLabel?: ReactNode;
  highlightLatest?: boolean;
}) {
  const { pub } = useImposter();
  if (clues.length === 0) {
    return emptyLabel ? <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">{emptyLabel}</p> : null;
  }
  return (
    <ol className="flex flex-col gap-2">
      {clues.map((c, i) => (
        <ClueCard key={`${c.cycle}-${c.round}-${c.playerId}`} clue={c} showAvatar={pub.settings.showClueAvatars} emphasis={highlightLatest && i === clues.length - 1} />
      ))}
    </ol>
  );
}

/** Tap to peek at your secret mid-game; hides itself again after a few seconds. */
export function SecretPeek() {
  const { priv } = useImposter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), 4000);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!priv) return null;
  const isImp = priv.role === "imposter";
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "inline-flex h-9 max-w-[60vw] items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors",
        // Same styling for every role, so the open state can't be read from across the room.
        open ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink-2",
      )}
      aria-label={open ? "Hide your secret" : "Peek at your secret"}
    >
      {open ? <EyeOff className="size-4 shrink-0" /> : <Eye className="size-4 shrink-0" />}
      <span className="truncate">
        {/* Closed label is identical for every role so a glance at the screen gives nothing away. */}
        {!open ? "Your secret" : isImp ? `Imposter${priv.category ? ` · ${priv.category}` : ""}` : priv.word}
      </span>
    </button>
  );
}

export { BottomBar, PhaseIntro, WaitingFor } from "../shared/parts";

export function SpectatorNote() {
  const { isParticipant, alive } = useImposter();
  if (isParticipant && alive) return null;
  return (
    <div className="mb-4 rounded-md border border-line bg-sunk px-3.5 py-2.5 text-sm text-ink-2">
      {isParticipant ? "You've been voted out. Keep watching and help with the discussion." : "You're watching this round. You'll be dealt in next time."}
    </div>
  );
}
