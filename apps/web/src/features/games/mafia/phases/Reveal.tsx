import { useState } from "react";
import { EyeOff, MoonStar } from "lucide-react";
import { ROLE_LABEL } from "@party/shared/games/mafia";
import { Button } from "../../../../components/ui/Button";
import { BottomBar, OutNote, PhaseIntro, ROLE_META, WaitingFor } from "../parts";
import { useMafia } from "../use-mafia";

export function RevealPhase() {
  const { pub, priv, me, can, actOrToast, isParticipant, players } = useMafia();
  const [shown, setShown] = useState(false);
  const [sending, setSending] = useState(false);
  const confirmed = pub.revealConfirmed.includes(me);
  const waiting = pub.participants.map((p) => p.id).filter((id) => !pub.revealConfirmed.includes(id));

  if (!isParticipant || !priv) {
    return (
      <>
        <OutNote />
        <PhaseIntro title="Roles are being dealt" body="Everyone is checking their role in secret. Night falls in a moment." />
      </>
    );
  }

  const meta = ROLE_META[priv.role];
  return (
    <>
      <PhaseIntro eyebrow="Before night falls" title="Your role" body="Check it privately. Nobody else can see this." />

      <div className="mx-auto w-full max-w-sm">
        {!shown ? (
          <button
            onClick={() => setShown(true)}
            className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-4 rounded-xl border border-line-strong bg-card p-6 shadow-lift active:translate-y-px"
          >
            <span className="flex size-16 items-center justify-center rounded-lg border border-line-strong text-ink-2">
              <MoonStar className="size-8" />
            </span>
            <span className="font-display text-2xl font-bold tracking-[-0.02em]">Tap to reveal</span>
            <span className="text-sm text-muted">Only you will see this</span>
          </button>
        ) : (
          // Every role uses the same card colours and layout: a red card seen from across
          // the sofa would give the Mafia away.
          <div className="flex aspect-[4/5] w-full animate-flip flex-col rounded-xl border border-line-strong bg-card p-6 shadow-lift" aria-live="polite">
            <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">You are</span>
            <div className="flex flex-1 flex-col justify-center">
              <meta.Icon className="mb-4 size-10 text-ink-2" />
              <h2 className="font-display text-[44px] leading-none font-extrabold tracking-[-0.035em] text-ink">
                {priv.role === "mafia" ? "Mafia" : `The ${ROLE_LABEL[priv.role]}`}
              </h2>
              <p className="mt-4 text-[15px] text-ink-2">{meta.blurb}</p>
              <p className="mt-2 text-[15px] text-ink-2">{meta.goal}</p>
              {priv.partners.length > 0 && (
                <p className="mt-4 text-sm">
                  Your partner{priv.partners.length > 1 ? "s" : ""}: <strong>{priv.partners.map((id) => players.get(id).nickname).join(", ")}</strong>
                </p>
              )}
            </div>
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
          <WaitingFor ids={waiting} label={waiting.length === 0 ? "Night is falling…" : `Waiting for ${waiting.length} more to check their role`} />
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!shown || !can("role.ack")}
            loading={sending}
            onClick={async () => {
              setSending(true);
              await actOrToast({ type: "role.ack" });
              setSending(false);
            }}
          >
            {shown ? "Got it" : "Reveal your role first"}
          </Button>
        )}
      </BottomBar>
    </>
  );
}
