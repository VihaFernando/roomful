import { useState } from "react";
import { Check, Crown, MoreHorizontal, UserMinus, WifiOff } from "lucide-react";
import type { PlayerPublic } from "@party/shared";
import { Button } from "../../components/ui/Button";
import { SectionLabel } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";
import { Sheet } from "../../components/ui/Sheet";
import { Avatar } from "../players/avatars";
import { useConnection, usePlayers, useRoomState } from "../rooms/room-context";

export function PlayerList() {
  const { room } = useRoomState();
  const { me, isHost, hostId, players } = usePlayers();
  const [target, setTarget] = useState<PlayerPublic | null>(null);
  if (!room) return null;
  const ready = players.filter((p) => p.ready).length;

  return (
    <section>
      <SectionLabel
        action={
          <span className="text-sm text-muted tabular">
            {players.length}/{room.settings.capacity}
            {room.settings.requireAllReady && ` · ${ready} ready`}
          </span>
        }
      >
        Players
      </SectionLabel>
      <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {players.map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex h-16 items-center gap-3 rounded-lg border bg-card pr-1 pl-3 transition-opacity",
              p.id === me ? "border-ink/40" : "border-line",
              p.presence === "away" && "opacity-70",
            )}
          >
            <span className="relative">
              <Avatar id={p.avatarId} size="md" dimmed={p.presence === "away"} />
              {p.ready && (
                <span
                  className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-card bg-crew text-white"
                  aria-label="Ready"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold">{p.nickname}</span>
                {p.id === hostId && <Crown className="size-4 shrink-0 text-accent" aria-label="Host" />}
              </span>
              <span className="block text-xs text-muted">
                {p.presence === "away" ? (
                  <span className="inline-flex items-center gap-1 text-warn">
                    <WifiOff className="size-3" /> Reconnecting
                  </span>
                ) : p.id === me ? (
                  "You"
                ) : p.id === hostId ? (
                  "Host"
                ) : p.ready ? (
                  "Ready"
                ) : (
                  "Here"
                )}
              </span>
            </span>
            {isHost && p.id !== me && (
              <button
                onClick={() => setTarget(p)}
                aria-label={`Options for ${p.nickname}`}
                className="flex size-11 items-center justify-center rounded-md text-muted active:bg-sunk"
              >
                <MoreHorizontal className="size-5" />
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: Math.max(0, Math.min(2, room.settings.capacity - players.length)) }, (_, i) => (
          <li key={`empty-${i}`} className="flex h-16 items-center rounded-lg border border-dashed border-line-strong px-4 text-sm text-muted">
            Open seat
          </li>
        ))}
      </ul>
      <PlayerActions player={target} onClose={() => setTarget(null)} />
    </section>
  );
}

function PlayerActions({ player, onClose }: { player: PlayerPublic | null; onClose: () => void }) {
  const conn = useConnection();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState(false);
  const close = () => {
    setConfirmKick(false);
    onClose();
  };
  if (!player) return null;

  return (
    <Sheet open={!!player} onOpenChange={(o) => !o && close()} title={player.nickname}>
      <div className="flex flex-col gap-2">
        <Button
          block
          size="lg"
          icon={<Crown className="size-4" />}
          disabled={player.presence !== "online"}
          loading={busy === "host"}
          onClick={async () => {
            setBusy("host");
            if (await conn.run("room.transferHost", { playerId: player.id })) close();
            setBusy(null);
          }}
        >
          Make host
        </Button>
        {player.presence !== "online" && <p className="text-sm text-muted">They need to be online to become host.</p>}
        {!confirmKick ? (
          <Button block size="lg" variant="danger" icon={<UserMinus className="size-4" />} onClick={() => setConfirmKick(true)}>
            Remove from room
          </Button>
        ) : (
          <div className="rounded-lg border border-imposter/25 bg-imposter-soft p-3">
            <p className="text-sm text-ink">
              Remove <strong>{player.nickname}</strong>? They can rejoin with the code as a new player.
            </p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" onClick={() => setConfirmKick(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                variant="danger"
                loading={busy === "kick"}
                onClick={async () => {
                  setBusy("kick");
                  if (await conn.run("room.kick", { playerId: player.id })) close();
                  setBusy(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
