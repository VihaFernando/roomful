import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { cn } from "../../../../components/ui/cn";
import { Sheet } from "../../../../components/ui/Sheet";
import { Spinner } from "../../../../components/ui/Spinner";
import { Avatar } from "../../../players/avatars";
import { ChatPanel } from "../Chat";
import { BottomBar, OutNote, PhaseIntro, WaitingFor } from "../parts";
import { useMafia } from "../use-mafia";

export function VotingPhase() {
  const { pub, priv, me, can, act, conn, players, alivePlayers } = useMafia();
  const voting = pub.voting!;
  const canVote = can("vote.cast");
  // Pending choice is shown immediately but only "confirmed" once the server acks.
  const [pending, setPending] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const confirmed = priv?.myVote ?? null;
  const selected = pending ?? confirmed;
  const notVoted = alivePlayers.filter((id) => !voting.votedIds.includes(id));

  async function vote(targetId: string) {
    if (!canVote || targetId === me || pending || targetId === confirmed) return;
    setPending(targetId);
    const r = await act({ type: "vote.cast", targetId });
    setPending(null);
    if (!r.ok) conn.toast(r.message, "error");
  }

  const tiedNames = voting.candidates.map((id) => players.get(id).nickname);
  return (
    <>
      <OutNote />
      <PhaseIntro
        eyebrow={`Day ${pub.day}`}
        title={voting.isRevote ? "Tie. Vote again" : "Who gets voted out?"}
        body={
          voting.isRevote
            ? `Only between ${tiedNames.join(" and ")}. If it ties again, nobody is voted out today.`
            : "Votes stay secret until voting ends. You can change yours until then."
        }
      />

      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Choose who to vote out">
        {voting.candidates.map((id) => {
          const p = players.get(id);
          const isMe = id === me;
          const isSelected = selected === id;
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
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {p.nickname}
                  {isMe && <span className="font-normal text-muted"> (you)</span>}
                </span>
                {voting.votedIds.includes(id) && <span className="shrink-0 text-xs font-semibold text-muted">voted</span>}
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
        <div className="flex items-center gap-3">
          <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-center gap-1.5">
            {canVote && (
              <p className="truncate text-[15px] font-semibold">
                {confirmed ? `Your vote: ${players.get(confirmed).nickname}` : "Tap a player to vote"}
              </p>
            )}
            <WaitingFor ids={notVoted} label={notVoted.length ? `${voting.votedIds.length} of ${alivePlayers.length} have voted` : "Counting votes…"} />
          </div>
          <Button variant="secondary" size="icon" aria-label="Open chat" onClick={() => setChatOpen(true)}>
            <MessageCircle className="size-5" />
          </Button>
        </div>
      </BottomBar>

      <Sheet open={chatOpen} onOpenChange={setChatOpen} title="Chat">
        <ChatPanel className="h-[60dvh]" />
      </Sheet>
    </>
  );
}
