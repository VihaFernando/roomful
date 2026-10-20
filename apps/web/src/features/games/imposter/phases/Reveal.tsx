import { useState } from "react";
import { EyeOff, Fingerprint } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { BottomBar, PhaseIntro, SpectatorNote, WaitingFor } from "../parts";
import { useImposter } from "../use-imposter";

export function RevealPhase() {
  const { pub, priv, me, can, actOrToast, isParticipant, players } = useImposter();
  const [shown, setShown] = useState(false);
  const [sending, setSending] = useState(false);
  const confirmed = pub.revealConfirmed.includes(me);
  const waiting = pub.participants.map((p) => p.id).filter((id) => !pub.revealConfirmed.includes(id));

  if (!isParticipant || !priv) {
    return (
      <>
        <SpectatorNote />
        <PhaseIntro title="Roles are being dealt" body="Everyone is checking their secret. Clues start in a moment." />
      </>
    );
  }

  const isImp = priv.role === "imposter";
  return (
    <>
      <PhaseIntro title="Your secret" body="Check it privately. Don't let anyone see your screen." />

      <div className="mx-auto w-full max-w-sm">
        {!shown ? (
          <button
            onClick={() => setShown(true)}
            className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-4 rounded-xl border border-ink bg-ink p-6 text-paper shadow-lift active:translate-y-px"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.035) 0 10px, transparent 10px 20px)",
            }}
          >
            <span className="flex size-14 items-center justify-center rounded-lg border border-paper/20">
              <Fingerprint className="size-7" />
            </span>
            <span className="font-display text-2xl font-bold tracking-[-0.02em]">Tap to reveal</span>
            <span className="text-sm text-paper/70">Only you will see this</span>
          </button>
        ) : (
          // Both roles use the same card colours and layout: in a room full of people,
          // a red card visible from across the sofa would give the Imposter away.
          <div className="flex aspect-[4/5] w-full animate-flip flex-col rounded-xl border border-line bg-card p-6 shadow-lift" aria-live="polite">
            {isImp ? (
              <>
                <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Your role</span>
                <div className="flex flex-1 flex-col justify-center">
                  <h2 className="font-display text-[40px] leading-none font-extrabold tracking-[-0.035em] text-ink">
                    You're the Imposter
                  </h2>
                  <p className="mt-4 text-[15px] text-ink-2">
                    You don't know the word. Listen to the clues, give one that fits, and don't get caught.
                  </p>
                  {priv.category && (
                    <p className="mt-4 text-sm">
                      Category: <strong>{priv.category}</strong>
                    </p>
                  )}
                  {priv.fellowImposters.length > 0 && (
                    <p className="mt-2 text-sm">
                      Your partner{priv.fellowImposters.length > 1 ? "s" : ""}:{" "}
                      <strong>{priv.fellowImposters.map((id) => players.get(id).nickname).join(", ")}</strong>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">The secret word</span>
                <div className="flex flex-1 flex-col justify-center">
                  <h2 className="font-display text-[44px] leading-[1.02] font-extrabold tracking-[-0.035em] break-words text-ink">
                    {priv.word}
                  </h2>
                  <p className="mt-2 text-sm text-muted">{priv.category}</p>
                  <p className="mt-5 text-[15px] text-ink-2">
                    Everyone has this word except the Imposter. Give clues that show you know it without giving it away.
                  </p>
                </div>
              </>
            )}
            <button
              onClick={() => setShown(false)}
              className="-mb-2 -ml-2 inline-flex h-11 items-center gap-2 self-start rounded-md px-2 text-sm font-semibold text-ink-2 active:bg-sunk"
            >
              <EyeOff className="size-4" /> Hide
            </button>
          </div>
        )}
      </div>

      <BottomBar>
        {confirmed ? (
          <WaitingFor
            ids={waiting}
            label={waiting.length === 0 ? "Starting…" : `Waiting for ${waiting.length} more to check their secret`}
          />
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!shown || !can("reveal.ack")}
            loading={sending}
            onClick={async () => {
              setSending(true);
              await actOrToast({ type: "reveal.ack" });
              setSending(false);
            }}
          >
            {shown ? "Got it" : "Reveal your secret first"}
          </Button>
        )}
      </BottomBar>
    </>
  );
}
