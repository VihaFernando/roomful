import { useContext, useState } from "react";
import { RotateCcw, Trophy } from "lucide-react";
import type { ImposterResultsReveal } from "@party/shared/games/imposter";
import { Button } from "../../../../components/ui/Button";
import { Badge, Card, SectionLabel } from "../../../../components/ui/Card";
import { cn } from "../../../../components/ui/cn";
import { Avatar } from "../../../players/avatars";
import { RoomUIContext, useRoomState } from "../../../rooms/room-context";
import { BottomBar, ClueList, PlayerTag } from "../parts";
import { useImposter } from "../use-imposter";
import { Tallies } from "./VoteResult";

const REASONS: Record<ImposterResultsReveal["reason"], string> = {
  imposters_caught: "The crew found the bluff.",
  crew_voted_wrong: "The crew voted out one of their own.",
  inconclusive: "Two tied votes. Nobody was voted out.",
  imposters_parity: "The Imposters matched the crew in number.",
  word_guessed: "The Imposter worked out the secret word.",
  cycle_limit: "The crew ran out of rounds.",
};

export function ResultsPhase() {
  const { openScores: onShowScores } = useContext(RoomUIContext);
  const { pub, players, conn, me } = useImposter();
  const { room } = useRoomState();
  const r = pub.results!;
  const isHost = room?.hostId === me;
  const awards = room?.match?.results?.awards ?? [];
  const pointsFor = (id: string) => awards.filter((a) => a.playerId === id).reduce((n, a) => n + a.points, 0);
  const crewWon = r.winner === "crew";
  const [busy, setBusy] = useState<"again" | "lobby" | null>(null);
  const cycles = [...new Set(pub.clues.map((c) => c.cycle))];

  return (
    <>
      <div className={cn("-mx-4 -mt-4 mb-5 border-b px-4 py-6", crewWon ? "border-crew/20 bg-crew-soft" : "border-imposter/20 bg-imposter-soft")}>
        <span className={cn("text-xs font-bold tracking-[0.12em] uppercase", crewWon ? "text-crew" : "text-imposter")}>
          {crewWon ? "Crew wins" : r.roles.filter((x) => x.role === "imposter").length > 1 ? "Imposters win" : "Imposter wins"}
        </span>
        <h1 className="mt-1 font-display text-[30px] leading-tight font-bold tracking-[-0.03em] text-balance">
          {room?.match?.results?.headline}
        </h1>
        <p className="mt-1 text-[15px] text-ink-2">{REASONS[r.reason]}</p>
      </div>

      <Card className="mb-6 flex items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">The word was</div>
          <div className="font-display text-3xl font-extrabold tracking-[-0.03em] break-words">{r.word}</div>
        </div>
        <Badge>{r.category}</Badge>
      </Card>

      <SectionLabel>Who was who</SectionLabel>
      <ul className="mb-6 flex flex-col divide-y divide-line rounded-lg border border-line bg-card">
        {r.roles.map(({ playerId, role }) => {
          const alive = pub.participants.find((p) => p.id === playerId)?.alive;
          const pts = pointsFor(playerId);
          return (
            <li key={playerId} className="flex items-center gap-3 px-3 py-2.5">
              <PlayerTag id={playerId} className="flex-1" />
              {!alive && <span className="text-xs text-muted">voted out</span>}
              <Badge tone={role === "imposter" ? "imposter" : "crew"}>{role === "imposter" ? "Imposter" : "Crew"}</Badge>
              <span className={cn("w-9 text-right font-mono text-sm font-semibold tabular", pts > 0 ? "text-ink" : "text-muted")}>
                +{pts}
              </span>
            </li>
          );
        })}
      </ul>

      {r.guesses.length > 0 && (
        <>
          <SectionLabel>Word guesses</SectionLabel>
          <ul className="mb-6 flex flex-col gap-2">
            {r.guesses.map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-2.5">
                <PlayerTag id={g.playerId} />
                <span className="flex items-center gap-2 text-[15px]">
                  {g.text ?? <span className="text-muted">Passed</span>}
                  {g.text !== null && <Badge tone={g.correct ? "imposter" : "neutral"}>{g.correct ? "Correct" : "Wrong"}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {pub.voteHistory.map((v, i) => {
        const ballots = r.ballots.filter((b) => b.cycle === v.cycle && b.isRevote === v.isRevote);
        return (
          <section key={i} className="mb-6">
            <SectionLabel>{v.isRevote ? `Revote${cycles.length > 1 ? `, round ${v.cycle}` : ""}` : cycles.length > 1 ? `Vote, round ${v.cycle}` : "The vote"}</SectionLabel>
            <Card className="px-4 py-4">
              <Tallies record={v} />
              {ballots.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
                  {ballots.map((b) => (
                    <li key={b.voterId} className="flex items-center gap-2 text-ink-2">
                      <Avatar id={players.get(b.voterId).avatarId} size="xs" />
                      <span className="truncate">
                        <strong className="text-ink">{players.get(b.voterId).nickname}</strong> voted for{" "}
                        <strong className="text-ink">{players.get(b.targetId).nickname}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        );
      })}

      <SectionLabel>All clues</SectionLabel>
      <div className="mb-6">
        <ClueList clues={pub.clues} highlightLatest={false} />
      </div>

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
            <span className="text-sm text-ink-2">Waiting for the host to start the next round</span>
            <Button variant="secondary" size="sm" icon={<Trophy className="size-4" />} onClick={onShowScores}>
              Scores
            </Button>
          </div>
        )}
      </BottomBar>
    </>
  );
}
