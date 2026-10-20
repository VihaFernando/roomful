import { Trophy } from "lucide-react";
import { cn } from "../../components/ui/cn";
import { Sheet } from "../../components/ui/Sheet";
import { Avatar } from "../players/avatars";
import { useRoomState } from "../rooms/room-context";

export function ScoreboardSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { room, playerId } = useRoomState();
  const rows = room?.scoreboard ?? [];
  const played = rows.some((r) => r.gamesPlayed > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Party scoreboard" description="Points carry over for as long as this room is open.">
      {!played ? (
        <div className="flex flex-col items-center py-8 text-center text-ink-2">
          <Trophy className="mb-3 size-7 text-muted" />
          <p className="text-[15px]">No games finished yet. Scores show up here after the first round.</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li
              key={r.playerId}
              className={cn(
                "flex h-14 items-center gap-3 rounded-md border px-3",
                r.playerId === playerId ? "border-ink/40 bg-card" : "border-line bg-card",
                !r.present && "opacity-55",
              )}
            >
              <span className={cn("w-6 text-center font-mono text-sm font-semibold", i === 0 ? "text-accent-ink" : "text-muted")}>{i + 1}</span>
              <Avatar id={r.avatarId} size="sm" dimmed={!r.present} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {r.nickname}
                  {r.playerId === playerId && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="block text-xs text-muted">
                  {r.wins} win{r.wins === 1 ? "" : "s"} · {r.gamesPlayed} played{!r.present && " · left"}
                </span>
              </span>
              <span className="font-mono text-xl font-semibold tabular">{r.points}</span>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
