import { useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { ChatPanel } from "../Chat";
import { BottomBar, OutNote, PhaseIntro, TownStrip, WaitingFor } from "../parts";
import { useMafia } from "../use-mafia";

export function DiscussionPhase() {
  const { pub, me, can, actOrToast, isParticipant, alive, alivePlayers } = useMafia();
  const [sending, setSending] = useState(false);
  const ready = pub.discussionReady.includes(me);
  const notReady = alivePlayers.filter((id) => !pub.discussionReady.includes(id));

  return (
    <>
      <OutNote />
      <PhaseIntro
        eyebrow={`Day ${pub.day}`}
        title="Who's lying?"
        body="Accuse, defend, claim a role or bluff. Voting opens when the timer ends or everyone is ready."
      />
      <TownStrip />
      {/* Sized to leave the composer above the sticky ready bar on a phone; shrinks with the keyboard (dvh). */}
      <ChatPanel className="mt-4 mb-4 h-[max(16rem,calc(100dvh-29rem))]" />

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
