import { useState, type FormEvent } from "react";
import { GUESS_MAX_LENGTH } from "@party/shared/games/imposter";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Card";
import { BottomBar, PhaseIntro, PlayerTag } from "../parts";
import { useImposter } from "../use-imposter";

export function GuessPhase() {
  const { pub, can } = useImposter();
  const g = pub.guess!;

  if (g.closed) {
    return (
      <>
        <PhaseIntro title={g.anyCorrect ? "The word was guessed" : "Wrong guess"} />
        {g.reveals.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {g.reveals.map((r) => (
              <li key={r.playerId} className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-3">
                <PlayerTag id={r.playerId} />
                <span className="flex items-center gap-2">
                  <span className="font-display text-lg font-semibold">{r.text ?? "Passed"}</span>
                  {r.text !== null && <Badge tone={r.correct ? "imposter" : "neutral"}>{r.correct ? "Correct" : "Wrong"}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-ink-2">The Imposter didn't get the word. The game goes on.</p>
        )}
      </>
    );
  }

  if (can("guess.submit")) return <GuessForm />;

  return (
    <PhaseIntro
      title="Last chance"
      body={
        pub.settings.victoryMode === "oneVote"
          ? "The Imposter survived and gets one guess at the secret word for bonus points."
          : "A surviving Imposter may take one guess at the word. If they get it, they win."
      }
    />
  );
}

function GuessForm() {
  const { act, conn, pub } = useImposter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(value: string, e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await act({ type: "guess.submit", text: value });
    setBusy(false);
    if (!r.ok) conn.toast(r.message, "error");
  }

  return (
    <>
      <PhaseIntro
        title="Guess the word"
        body={
          pub.settings.victoryMode === "oneVote"
            ? "You survived. Name the secret word for bonus points. One try."
            : "Name the secret word to win right now. One try for the whole game, so you can also pass and keep it."
        }
      />
      {pub.category && (
        <p className="mb-4 text-sm text-ink-2">
          Category: <strong>{pub.category}</strong>
        </p>
      )}
      <BottomBar>
        <form onSubmit={(e) => send(text.trim(), e)} className="flex flex-col gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, GUESS_MAX_LENGTH))}
            autoFocus
            enterKeyHint="send"
            autoComplete="off"
            placeholder="Your guess"
            aria-label="Your guess"
            className="h-13 rounded-md border border-ink bg-card px-3.5 text-base outline-none"
          />
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" onClick={() => send("")} disabled={busy}>
              Pass
            </Button>
            <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={!text.trim()} loading={busy}>
              Lock in guess
            </Button>
          </div>
        </form>
      </BottomBar>
    </>
  );
}
