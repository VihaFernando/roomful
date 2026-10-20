import type { ImposterPhase, ImposterSettings } from "@party/shared/games/imposter";
import { useRoomState } from "../../rooms/room-context";
import { Countdown, TimerBar } from "../../../components/ui/Countdown";
import { cn } from "../../../components/ui/cn";
import { CluesPhase } from "./phases/Clues";
import { DiscussionPhase } from "./phases/Discussion";
import { GuessPhase } from "./phases/Guess";
import { ResultsPhase } from "./phases/Results";
import { RevealPhase } from "./phases/Reveal";
import { VoteResultPhase } from "./phases/VoteResult";
import { VotingPhase } from "./phases/Voting";
import { SecretPeek } from "./parts";
import { useImposter } from "./use-imposter";

const STEPS: { id: ImposterPhase[]; label: string }[] = [
  { id: ["reveal"], label: "Role" },
  { id: ["clues"], label: "Clues" },
  { id: ["discussion"], label: "Discuss" },
  { id: ["voting", "voteResult", "guess"], label: "Vote" },
  { id: ["results"], label: "Results" },
];

/** Fixed server-side durations for phases without a configurable timer (see flow.ts). */
const FIXED_MS: Partial<Record<ImposterPhase, number>> = { reveal: 60_000, voteResult: 6_000, guess: 30_000 };

export function ImposterScreen() {
  const { view, pub, clockOffset } = useImposter();
  const settings = (useRoomState().room?.gameSettings ?? {}) as Partial<ImposterSettings>;
  const phase = pub.phase;
  const configured = { clues: settings.clueSeconds, discussion: settings.discussionSeconds, voting: settings.voteSeconds } as Partial<
    Record<ImposterPhase, number>
  >;
  const totalMs = configured[phase] ? configured[phase]! * 1000 : (FIXED_MS[phase] ?? 30_000);
  const stepIndex = STEPS.findIndex((s) => s.id.includes(phase));

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-20 border-b border-line bg-paper">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-safe">
          <ol className="flex min-w-0 items-center gap-1" aria-label="Game progress">
            {STEPS.map((s, i) => (
              <li
                key={s.label}
                aria-current={i === stepIndex ? "step" : undefined}
                className={cn(
                  "rounded-sm px-1.5 py-1 text-xs font-semibold whitespace-nowrap",
                  i === stepIndex ? "bg-ink text-paper" : i < stepIndex ? "text-ink-2" : "text-muted/70",
                  i !== stepIndex && "max-[400px]:hidden",
                )}
              >
                {s.label}
              </li>
            ))}
            {pub.cycle > 1 && <li className="ml-1 text-xs text-muted">Round {pub.cycle}</li>}
          </ol>
          <div className="flex shrink-0 items-center gap-2">
            {phase !== "reveal" && phase !== "results" && <SecretPeek />}
            <Countdown endsAt={view.endsAt} clockOffset={clockOffset} />
          </div>
        </div>
        <TimerBar endsAt={view.endsAt} totalMs={totalMs} clockOffset={clockOffset} />
      </div>

      <div key={`${phase}-${pub.cycle}-${pub.voting?.isRevote ?? ""}`} className="mx-auto flex w-full max-w-2xl flex-1 animate-enter flex-col px-safe pt-5">
        {phase === "reveal" && <RevealPhase />}
        {phase === "clues" && <CluesPhase />}
        {phase === "discussion" && <DiscussionPhase />}
        {phase === "voting" && <VotingPhase />}
        {phase === "voteResult" && <VoteResultPhase />}
        {phase === "guess" && <GuessPhase />}
        {phase === "results" && <ResultsPhase />}
      </div>
    </div>
  );
}
