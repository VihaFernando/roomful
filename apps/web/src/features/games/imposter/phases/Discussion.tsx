import { useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { Avatar } from "../../../players/avatars";
import { BottomBar, PhaseIntro, SpectatorNote, WaitingFor } from "../parts";
import { useImposter } from "../use-imposter";

export function DiscussionPhase() {
  const { pub, me, can, actOrToast, players, isParticipant, alive } = useImposter();
  const [sending, setSending] = useState(false);
  const alivePlayers = pub.participants.filter((p) => p.alive).map((p) => p.id);
  const ready = pub.discussionReady.includes(me);
  const notReady = alivePlayers.filter((id) => !pub.discussionReady.includes(id));

  return (
    <>
      <SpectatorNote />
      <PhaseIntro title="Who's bluffing?" body="Talk it through. Voting opens when the timer runs out or everyone is ready." />

      <ul className="flex flex-col gap-2">
        {pub.turnOrder.map((id) => {
          const p = players.get(id);
          const clues = pub.clues.filter((c) => c.playerId === id && c.cycle === pub.cycle);
          return (
            <li key={id} className="flex items-start gap-3 rounded-md border border-line bg-card px-3 py-2.5">
              <Avatar id={p.avatarId} size="md" dimmed={p.presence === "gone"} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-2">
                  {p.nickname}
                  {id === me && <span className="font-normal text-muted"> (you)</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                  {clues.length === 0 && <span className="text-[15px] text-muted italic">No clue</span>}
                  {clues.map((c) => (
                    <span key={c.round} className={c.text === null ? "text-[15px] text-muted italic" : "font-display text-lg leading-snug font-semibold break-words"}>
                      {c.text ?? "Ran out of time"}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {isParticipant && alive && (
        <BottomBar>
          {ready || !can("discussion.ready") ? (
            <WaitingFor ids={notReady} label={notReady.length ? `${notReady.length} still talking` : "Opening the vote…"} />
          ) : (
            <Button
              variant="ink"
              size="lg"
              block
              loading={sending}
              onClick={async () => {
                setSending(true);
                await actOrToast({ type: "discussion.ready" });
                setSending(false);
              }}
            >
              I'm ready to vote
            </Button>
          )}
        </BottomBar>
      )}
    </>
  );
}
