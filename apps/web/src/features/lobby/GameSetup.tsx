import { useEffect, useRef, useState } from "react";
import { BookOpen, Clock, Users } from "lucide-react";
import type { GameListing } from "@party/shared";
import { Button } from "../../components/ui/Button";
import { Card, SectionLabel } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";
import { Stepper, Toggle } from "../../components/ui/Controls";
import { gameUIs } from "../games/registry";
import { useGames } from "../games/use-games";
import { useConnection, usePlayers, useRoomState } from "../rooms/room-context";

/** Game cards, driven by the server registry (not a hardcoded list). */
export function GamePicker() {
  const { games, error } = useGames();
  const { room } = useRoomState();
  const { isHost } = usePlayers();
  const conn = useConnection();
  if (error) return <p className="text-sm text-imposter">Couldn't load games. Refresh to try again.</p>;
  if (!games || !room) return <div className="h-24 rounded-lg border border-line bg-sunk" aria-label="Loading games" />;

  return (
    <section>
      <SectionLabel>{isHost ? "Pick a game" : "Game"}</SectionLabel>
      <div className="flex flex-col gap-2">
        {games
          .filter((g) => isHost || g.id === room.selectedGameId)
          .map((g) => (
            <GameCard
              key={g.id}
              game={g}
              selected={g.id === room.selectedGameId}
              interactive={isHost}
              onSelect={() => g.id !== room.selectedGameId && conn.run("game.select", { gameId: g.id })}
            />
          ))}
      </div>
    </section>
  );
}

function GameCard({ game, selected, interactive, onSelect }: { game: GameListing; selected: boolean; interactive: boolean; onSelect: () => void }) {
  const ui = gameUIs[game.id];
  const Icon = ui?.Icon;
  const body = (
    <>
      {Icon ? <Icon className="size-12 shrink-0" /> : <span className="size-12 shrink-0 rounded-md bg-sunk" />}
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-display text-lg font-bold tracking-[-0.02em]">{game.name}</span>
        <span className="block text-sm text-ink-2">{game.tagline}</span>
        <span className="mt-1 flex gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" /> {game.minPlayers}–{game.maxPlayers}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {game.estimatedMinutes[0]}–{game.estimatedMinutes[1]} min
          </span>
        </span>
      </span>
    </>
  );
  const cls = cn("flex w-full items-center gap-3 rounded-lg border bg-card p-3", selected ? "border-ink ring-1 ring-ink" : "border-line");
  return interactive ? (
    <button className={cn(cls, "active:bg-sunk")} aria-pressed={selected} onClick={onSelect}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Game settings (host edits, everyone sees) plus room-level settings for the host. */
export function SettingsPanel({ onOpenRules }: { onOpenRules: () => void }) {
  const { room } = useRoomState();
  const { isHost, players } = usePlayers();
  const conn = useConnection();
  const { games } = useGames();
  const gameId = room?.selectedGameId ?? null;
  const ui = gameId ? gameUIs[gameId] : undefined;
  const listing = games?.find((g) => g.id === gameId);

  // Mirror server settings locally so controls respond instantly; the server echo replaces them.
  // Tagged with the game they belong to: right after switching games the mirror still holds the
  // previous game's settings for one render, and must never reach the new game's form or summary.
  const [mirror, setMirror] = useState<{ gameId: string | null; settings: unknown }>({ gameId, settings: room?.gameSettings });
  const lastSent = useRef<string | null>(null);
  useEffect(() => {
    setMirror({ gameId, settings: room?.gameSettings });
  }, [gameId, room?.gameSettings]);
  const [open, setOpen] = useState(false);
  const local = mirror.gameId === gameId ? mirror.settings : room?.gameSettings;

  if (!room || !gameId || !ui || !local) return null;
  const Form = ui.SettingsForm;
  const online = players.filter((p) => p.presence === "online").length;

  async function change(next: unknown) {
    setMirror({ gameId, settings: next });
    const json = JSON.stringify(next);
    lastSent.current = json;
    const ok = await conn.run("game.updateSettings", { gameId: gameId!, settings: next });
    if (!ok && lastSent.current === json) setMirror({ gameId, settings: room?.gameSettings });
  }

  return (
    <section>
      <SectionLabel
        action={
          <button onClick={onOpenRules} className="-mr-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-ink-2 active:bg-sunk">
            <BookOpen className="size-4" /> How to play
          </button>
        }
      >
        Settings
      </SectionLabel>
      <Card className="px-4">
        {isHost ? (
          <>
            <button onClick={() => setOpen((o) => !o)} className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={open}>
              <span>
                <span className="block text-[15px] font-semibold">{listing?.name ?? "Game"} settings</span>
                <span className="block text-sm text-muted">{ui.summarize && listing ? ui.summarize(local, listing) : "Tap to adjust"}</span>
              </span>
              <span className="text-sm font-semibold text-accent-ink">{open ? "Done" : "Edit"}</span>
            </button>
            {open && (
              <div className="border-t border-line">
                <Form settings={local} editable playerCount={online} onChange={change} />
                <RoomSettings />
              </div>
            )}
          </>
        ) : (
          <p className="py-3.5 text-sm text-ink-2">{ui.summarize && listing ? ui.summarize(local, listing) : "The host is choosing settings."}</p>
        )}
      </Card>
    </section>
  );
}

function RoomSettings() {
  const { room } = useRoomState();
  const conn = useConnection();
  if (!room) return null;
  return (
    <div className="border-t border-line py-2">
      <div className="flex items-center justify-between gap-3 py-2">
        <span>
          <span className="block text-[15px] font-semibold">Room size</span>
          <span className="block text-sm text-muted">Players allowed in the room</span>
        </span>
        <Stepper
          label="Room size"
          value={room.settings.capacity}
          min={Math.max(2, room.players.length)}
          max={16}
          onChange={(v) => conn.run("room.updateSettings", { capacity: v })}
        />
      </div>
      <Toggle
        label="Wait for everyone to be ready"
        description="Start unlocks once every player taps Ready"
        checked={room.settings.requireAllReady}
        onChange={(v) => conn.run("room.updateSettings", { requireAllReady: v })}
      />
    </div>
  );
}

export function StartBar() {
  const { room } = useRoomState();
  const { isHost, me, players } = usePlayers();
  const conn = useConnection();
  const [busy, setBusy] = useState(false);
  if (!room) return null;
  const mine = players.find((p) => p.id === me);
  const host = players.find((p) => p.id === room.hostId);

  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-line bg-paper px-4 pt-3 pb-safe">
      <div className="mx-auto flex max-w-2xl items-center gap-2">
        <Button
          variant={mine?.ready ? "secondary" : "ink"}
          size="lg"
          className={isHost ? "" : "flex-1"}
          aria-pressed={mine?.ready}
          onClick={() => conn.run("room.setReady", { ready: !mine?.ready })}
        >
          {mine?.ready ? "Ready ✓" : "I'm ready"}
        </Button>
        {isHost ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <Button
              variant="primary"
              size="lg"
              block
              disabled={!!room.startBlocker}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await conn.run("game.start", {});
                setBusy(false);
              }}
            >
              Start game
            </Button>
          </div>
        ) : null}
      </div>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted" aria-live="polite">
        {isHost ? (room.startBlocker ?? "Everyone's here? Start when you're ready.") : `Waiting for ${host?.nickname ?? "the host"} to start`}
      </p>
    </div>
  );
}
