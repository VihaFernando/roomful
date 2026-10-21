import { useContext, useState } from "react";
import { Moon, RotateCcw, Sun, Trophy } from "lucide-react";
import type { MafiaResultsReveal, NightRecord } from "@party/shared/games/mafia";
import { Button } from "../../../../components/ui/Button";
import { Card, SectionLabel } from "../../../../components/ui/Card";
import { cn } from "../../../../components/ui/cn";
import { RoomUIContext, useRoomState } from "../../../rooms/room-context";
import { BottomBar, PlayerTag, RoleBadge, Tallies } from "../parts";
import { useMafia } from "../use-mafia";

const REASONS: Record<MafiaResultsReveal["reason"], string> = {
  mafia_eliminated: "Every Mafia member was voted out.",
  mafia_parity: "The Mafia matched the town in number.",
  day_limit: "The town ran out of days to find them.",
};

export function ResultsPhase() {
  const { openScores } = useContext(RoomUIContext);
  const { pub, players, conn, me } = useMafia();
  const { room } = useRoomState();
  const r = pub.results!;
  const isHost = room?.hostId === me;
  const awards = room?.match?.results?.awards ?? [];
  const pointsFor = (id: string) => awards.filter((a) => a.playerId === id).reduce((n, a) => n + a.points, 0);
  const townWon = r.winner === "town";
  const [busy, setBusy] = useState<"again" | "lobby" | null>(null);
  const name = (id: string | null) => (id ? players.get(id).nickname : "nobody");

  /** How each player's game ended. */
  const fate = (id: string) => {
    const night = r.nights.find((n) => n.killedId === id);
    if (night) return `Killed night ${night.night}`;
    const vote = pub.voteHistory.find((v) => v.eliminatedId === id);
    if (vote) return `Voted out day ${vote.day}`;
    return pub.participants.find((p) => p.id === id)?.alive ? "Survived" : "Left";
  };
  const days = [...new Set([...r.nights.map((n) => n.night), ...pub.voteHistory.map((v) => v.day)])].sort((a, b) => a - b);

  return (
    <>
      <div className={cn("-mx-4 -mt-5 mb-5 border-b px-4 py-6", townWon ? "border-crew/20 bg-crew-soft" : "border-imposter/20 bg-imposter-soft")}>
        <span className={cn("text-xs font-bold tracking-[0.12em] uppercase", townWon ? "text-crew" : "text-imposter")}>
          {townWon ? "Town wins" : "Mafia wins"}
        </span>
        <h1 className="mt-1 font-display text-[30px] leading-tight font-bold tracking-[-0.03em] text-balance">{room?.match?.results?.headline}</h1>
        <p className="mt-1 text-[15px] text-ink-2">{REASONS[r.reason]}</p>
      </div>

      <SectionLabel>Who was who</SectionLabel>
      <ul className="mb-6 flex flex-col divide-y divide-line rounded-lg border border-line bg-card">
        {r.roles.map(({ playerId, role }) => {
          const pts = pointsFor(playerId);
          return (
            <li key={playerId} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <PlayerTag id={playerId} />
                <span className="mt-0.5 block pl-10 text-xs text-muted">{fate(playerId)}</span>
              </span>
              <RoleBadge role={role} />
              <span className={cn("w-9 text-right font-mono text-sm font-semibold tabular", pts > 0 ? "text-ink" : "text-muted")}>+{pts}</span>
            </li>
          );
        })}
      </ul>

      <SectionLabel>How it happened</SectionLabel>
      <ol className="mb-6 flex flex-col gap-3">
        {days.map((d) => {
          const night = r.nights.find((n) => n.night === d);
          const votes = pub.voteHistory.filter((v) => v.day === d);
          return (
            <li key={d}>
              <Card className="overflow-hidden">
                {night && <NightSummary night={night} name={name} hasDoctor={pub.settings.doctor} hasInvestigator={pub.settings.investigator} />}
                {votes.map((v) => {
                  const ballots = r.ballots.filter((b) => b.day === v.day && b.isRevote === v.isRevote);
                  return (
                    <div key={`${v.day}-${v.isRevote}`} className="border-t border-line px-4 py-3.5 first:border-t-0">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Sun className="size-4 text-ink-2" /> {v.isRevote ? `Day ${v.day} revote` : `Day ${v.day} vote`}
                      </div>
                      <Tallies record={v} />
                      {ballots.length > 0 && (
                        <p className="mt-3 text-sm text-ink-2">
                          {ballots.map((b) => `${name(b.voterId)} → ${name(b.targetId)}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </Card>
            </li>
          );
        })}
      </ol>

      <BottomBar>
        {isHost ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              loading={busy === "lobby"}
              disabled={!!busy}
              onClick={async () => {
                setBusy("lobby");
                await conn.run("game.end", {});
                setBusy(null);
              }}
            >
              Lobby
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              icon={<RotateCcw className="size-4" />}
              loading={busy === "again"}
              disabled={!!busy}
              onClick={async () => {
                setBusy("again");
                await conn.run("game.restart", {});
                setBusy(null);
              }}
            >
              Play again
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-2">Waiting for the host to start the next game</span>
            <Button variant="secondary" size="sm" icon={<Trophy className="size-4" />} onClick={openScores}>
              Scores
            </Button>
          </div>
        )}
      </BottomBar>
    </>
  );
}

function NightSummary({
  night,
  name,
  hasDoctor,
  hasInvestigator,
}: {
  night: NightRecord;
  name: (id: string | null) => string;
  hasDoctor: boolean;
  hasInvestigator: boolean;
}) {
  const saved = night.targetId !== null && night.targetId === night.protectedId;
  return (
    <div className="px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Moon className="size-4 text-ink-2" /> Night {night.night}
      </div>
      <ul className="flex flex-col gap-1 text-[15px] text-ink-2">
        <li>
          The Mafia went for <strong className="text-ink">{name(night.targetId)}</strong>
          {night.killedId ? "." : saved ? ", but the Doctor saved them." : "."}
        </li>
        {hasDoctor && (
          <li>
            The Doctor protected <strong className="text-ink">{name(night.protectedId)}</strong>.
          </li>
        )}
        {hasInvestigator && (
          <li>
            The Investigator checked <strong className="text-ink">{name(night.checkedId)}</strong>.
          </li>
        )}
      </ul>
    </div>
  );
}
