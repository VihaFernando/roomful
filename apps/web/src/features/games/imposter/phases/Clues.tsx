import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { CLUE_MAX_LENGTH } from "@party/shared/games/imposter";
import { cn } from "../../../../components/ui/cn";
import { Spinner } from "../../../../components/ui/Spinner";
import { Avatar } from "../../../players/avatars";
import { BottomBar, ClueList, PhaseIntro, SpectatorNote, TurnStrip } from "../parts";
import { useImposter } from "../use-imposter";

export function CluesPhase() {
  const { pub, me, can, players } = useImposter();
  const myTurn = can("clue.submit");
  const current = pub.currentTurnId ? players.get(pub.currentTurnId) : null;
  const thisCycle = pub.clues.filter((c) => c.cycle === pub.cycle);
  const earlier = pub.clues.filter((c) => c.cycle < pub.cycle);

  return (
    <>
      <SpectatorNote />
      <PhaseIntro
        title={myTurn ? "Your turn" : current ? `${current.nickname} is up` : "Clues"}
        body={
          // Identical for both roles: nearby players can read this screen.
          myTurn
            ? "One short clue. Show you're in on the word without giving it away."
            : pub.settings.clueRoundsPerCycle > 1
              ? `Round ${pub.clueRound} of ${pub.settings.clueRoundsPerCycle}. Everyone gives one clue per round.`
              : "Everyone gives one clue, in order."
        }
      />
      <TurnStrip />
      <div className="mt-5">
        <ClueList clues={thisCycle} emptyLabel="No clues yet. The first one sets the tone." />
      </div>
      {earlier.length > 0 && (
        <details className="mt-5 rounded-md border border-line bg-card px-3 py-2">
          <summary className="cursor-pointer py-1 text-sm font-semibold text-ink-2">Earlier clues ({earlier.length})</summary>
          <div className="mt-2 pb-1">
            <ClueList clues={earlier} />
          </div>
        </details>
      )}
      <BottomBar>
        {myTurn ? (
          <ClueComposer key={`${pub.cycle}-${pub.clueRound}`} />
        ) : current ? (
          <div className="flex h-12 items-center gap-3">
            <Avatar id={current.avatarId} size="sm" />
            <span className="text-sm text-ink-2">
              {current.id === me ? "Sending…" : `Waiting for ${current.nickname}'s clue`}
              {current.presence === "away" && <span className="text-warn"> · reconnecting</span>}
            </span>
          </div>
        ) : null}
      </BottomBar>
    </>
  );
}

function ClueComposer() {
  const { act } = useImposter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Gentle nudge on phones that support it; harmless elsewhere.
    navigator.vibrate?.(30);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setError(null);
    const r = await act({ type: "clue.submit", text: clean });
    setSending(false);
    if (!r.ok) {
      setError(r.message);
      inputRef.current?.focus();
    }
  }

  const left = CLUE_MAX_LENGTH - text.length;
  return (
    <form onSubmit={submit}>
      <div className={cn("flex items-center gap-2 rounded-lg border bg-card p-1.5 pl-3.5", error ? "border-imposter" : "border-ink")}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, CLUE_MAX_LENGTH));
            if (error) setError(null);
          }}
          autoFocus
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          maxLength={CLUE_MAX_LENGTH}
          placeholder="Type your clue"
          aria-label="Your clue"
          disabled={sending}
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70"
        />
        <span className={cn("w-7 text-right font-mono text-xs tabular", left <= 5 ? "text-accent-ink" : "text-muted")}>{left}</span>
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send clue"
          className="flex size-11 items-center justify-center rounded-md bg-accent text-white active:bg-accent-press disabled:bg-sunk disabled:text-muted"
        >
          {sending ? <Spinner className="size-4" /> : <ArrowUp className="size-5" />}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm font-medium text-imposter" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
