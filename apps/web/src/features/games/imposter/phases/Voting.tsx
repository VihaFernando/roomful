import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "../../../../components/ui/cn";
import { Spinner } from "../../../../components/ui/Spinner";
import { Avatar } from "../../../players/avatars";
import { BottomBar, PhaseIntro, SpectatorNote, WaitingFor } from "../parts";
import { useImposter } from "../use-imposter";

export function VotingPhase() {
  const { pub, priv, me, can, act, conn, players } = useImposter();
  const voting = pub.voting!;
  const canVote = can("vote.cast");
  // Pending choice is shown immediately but only "confirmed" once the server acks.
  const [pending, setPending] = useState<string | null>(null);
  const confirmed = priv?.myVote ?? null;
  const selected = pending ?? confirmed;
  const voters = pub.participants.filter((p) => p.alive).map((p) => p.id);
  const notVoted = voters.filter((id) => !voting.votedIds.includes(id));

  async function vote(targetId: string) {
    if (!canVote || targetId === me || pending) return;
    if (targetId === confirmed) return;
    setPending(targetId);
    const r = await act({ type: "vote.cast", targetId });
    setPending(null);
    if (!r.ok) conn.toast(r.message, "error");
  }

  const tiedNames = voting.candidates.map((id) => players.get(id).nickname);
  return (
    <>
      <SpectatorNote />
      <PhaseIntro
        title={voting.isRevote ? "Tie. Vote again" : "Vote out the Imposter"}
        body={
          voting.isRevote
            ? `Only between ${tiedNames.join(" and ")}. If it ties again, nobody goes out.`
            : "Votes stay secret until everyone has voted. You can change yours until then."
        }
      />

      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Choose who to vote out">
        {voting.candidates.map((id) => {
          const p = players.get(id);
          const isMe = id === me;
          const isSelected = selected === id;
          const clues = pub.clues.filter((c) => c.playerId === id && c.cycle === pub.cycle && c.text);
          const hasVoted = voting.votedIds.includes(id);
          return (
            <li key={id}>
              <button
                role="radio"
                aria-checked={isSelected}
                disabled={!canVote || isMe}
                onClick={() => vote(id)}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-[border-color,background-color] duration-100",
                  isSelected ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-line active:bg-sunk",
                  isMe && "opacity-60",
                )}
              >
                <Avatar id={p.avatarId} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{p.nickname}</span>
                    {isMe && <span className="text-sm text-muted">(you)</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink-2">
                    {clues.length ? clues.map((c) => `“${c.text}”`).join(" · ") : "No clue given"}
                  </span>
                </span>
                {hasVoted && <span className="shrink-0 text-xs font-semibold text-muted">voted</span>}
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                    isSelected ? "border-accent bg-accent text-white" : "border-line-strong",
                  )}
                  aria-hidden="true"
                >
                  {pending === id ? <Spinner className="size-3.5" /> : isSelected ? <Check className="size-4" /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <BottomBar>
        <div className="flex min-h-12 flex-col justify-center gap-1.5">
          {canVote && (
            <p className="text-[15px] font-semibold">
              {confirmed ? (
                <>
                  Your vote: {players.get(confirmed).nickname}
                  <span className="font-normal text-muted"> · tap someone else to change</span>
                </>
              ) : (
                "Tap a player to vote"
              )}
            </p>
          )}
          <WaitingFor ids={notVoted} label={notVoted.length ? `${voting.votedIds.length} of ${voters.length} have voted` : "Counting votes…"} />
        </div>
      </BottomBar>
    </>
  );
}
