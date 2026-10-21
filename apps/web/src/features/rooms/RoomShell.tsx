import { Suspense, useEffect, useState } from "react";
import { BookOpen, LogOut, MoreVertical, Trophy, WifiOff } from "lucide-react";
import { useNavigate } from "react-router";
import { Wordmark } from "../../components/layout/Wordmark";
import { Button } from "../../components/ui/Button";
import { Sheet } from "../../components/ui/Sheet";
import { LoadingScreen, Spinner } from "../../components/ui/Spinner";
import { StatePanel } from "../../components/ui/States";
import { Toasts } from "../../components/ui/Toasts";
import { flags, sessions } from "../../services/storage";
import { gameUIs } from "../games/registry";
import { useGames } from "../games/use-games";
import { Lobby } from "../lobby/Lobby";
import { formatCode } from "../lobby/RoomCodeCard";
import { ScoreboardSheet } from "../scoreboard/Scoreboard";
import { RoomUIContext, useConnection, useRoomState } from "./room-context";

export function RoomShell() {
  const conn = useConnection();
  const state = useRoomState();
  const navigate = useNavigate();
  const { games } = useGames();
  const [sheet, setSheet] = useState<null | "scores" | "rules" | "menu" | "leave">(null);
  const [leaving, setLeaving] = useState(false);
  const { room, game } = state;
  const gameId = room?.match?.gameId ?? room?.selectedGameId ?? null;
  const ui = gameId ? gameUIs[gameId] : undefined;
  const listing = games?.find((g) => g.id === gameId);

  // Show the rules once per game per device before the first round.
  useEffect(() => {
    if (!gameId || !room || room.match || !ui) return;
    if (!flags.get(`rules-seen:${gameId}`)) {
      setSheet("rules");
      flags.set(`rules-seen:${gameId}`);
    }
  }, [gameId, room?.match, ui]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!room) return <LoadingScreen label="Connecting to the room…" />;

  const inGame = !!room.match && !!game;
  const Screen = ui?.Screen;
  const Rules = ui?.Rules;

  return (
    <RoomUIContext.Provider value={{ openScores: () => setSheet("scores"), openRules: () => setSheet("rules") }}>
      <div className="flex min-h-dvh flex-col pt-safe">
        <header className="border-b border-line bg-paper">
          <div className={`mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-2 px-safe ${inGame ? "" : "lg:max-w-5xl"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <Wordmark />
              <span className="rounded-sm bg-sunk px-2 py-1 font-mono text-[13px] font-semibold tracking-[0.06em] text-ink-2">
                {formatCode(room.code)}
              </span>
            </div>
            <div className="flex items-center">
              <button onClick={() => setSheet("scores")} className="flex size-11 items-center justify-center rounded-md active:bg-sunk" aria-label="Scoreboard">
                <Trophy className="size-5" />
              </button>
              <button onClick={() => setSheet("menu")} className="-mr-2 flex size-11 items-center justify-center rounded-md active:bg-sunk" aria-label="Room menu">
                <MoreVertical className="size-5" />
              </button>
            </div>
          </div>
        </header>

        <ConnectionBanner />

        {inGame ? (
          Screen ? (
            <Suspense fallback={<LoadingScreen label="Loading the game…" />}>
              <Screen />
            </Suspense>
          ) : (
            <StatePanel title="Update needed" body="This game isn't available in this version of the app. Refresh the page." />
          )
        ) : room.match ? (
          <LoadingScreen label="Loading the game…" />
        ) : (
          <Lobby onOpenRules={() => setSheet("rules")} />
        )}
      </div>

      <ScoreboardSheet open={sheet === "scores"} onOpenChange={(o) => setSheet(o ? "scores" : null)} />

      <Sheet open={sheet === "rules"} onOpenChange={(o) => setSheet(o ? "rules" : null)} title={`How to play ${listing?.name ?? ""}`.trim()} description={listing?.description}>
        {Rules ? <Rules /> : null}
      </Sheet>

      <Sheet open={sheet === "menu"} onOpenChange={(o) => setSheet(o ? "menu" : null)} title="Room">
        <div className="flex flex-col gap-2">
          {Rules && (
            <Button block size="lg" icon={<BookOpen className="size-4" />} onClick={() => setSheet("rules")}>
              How to play
            </Button>
          )}
          <Button block size="lg" variant="danger" icon={<LogOut className="size-4" />} onClick={() => setSheet("leave")}>
            Leave room
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "leave"}
        onOpenChange={(o) => setSheet(o ? "leave" : null)}
        title="Leave this room?"
        description={room.hostId === state.playerId ? "Someone else will become host. You can rejoin with the code as a new player." : "You can rejoin with the code as a new player."}
        footer={
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => setSheet(null)}>
              Stay
            </Button>
            <Button
              size="lg"
              variant="danger"
              className="flex-1"
              loading={leaving}
              onClick={async () => {
                setLeaving(true);
                await conn.request("room.leave", {}).catch(() => {});
                sessions.forget(room.code);
                navigate("/", { replace: true });
              }}
            >
              Leave
            </Button>
          </div>
        }
      >
        {null}
      </Sheet>

      <Toasts toasts={state.toasts} onDismiss={(id) => conn.dismissToast(id)} />
    </RoomUIContext.Provider>
  );
}

function ConnectionBanner() {
  const { status, attempts } = useRoomState();
  const conn = useConnection();
  if (status === "open" || status === "closed") return null;
  const offline = status === "offline";
  return (
    <div
      className={offline ? "border-b border-imposter/20 bg-imposter-soft text-imposter" : "border-b border-warn/25 bg-warn-soft text-warn"}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex min-h-11 max-w-2xl items-center justify-between gap-3 px-safe py-1.5 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          {offline ? <WifiOff className="size-4" /> : <Spinner className="size-4" />}
          {offline ? "You're offline. Your seat is saved." : status === "connecting" ? "Connecting…" : "Reconnecting… your seat is saved."}
        </span>
        {attempts >= 3 && (
          <button onClick={() => conn.retry()} className="h-9 rounded-md px-2 underline underline-offset-2">
            Retry now
          </button>
        )}
      </div>
    </div>
  );
}
