import { Moon, Sun, Trophy, VenetianMask } from "lucide-react";
import type { MafiaPhase } from "@party/shared/games/mafia";
import { Countdown, TimerBar } from "../../../components/ui/Countdown";
import { DiscussionPhase } from "./phases/Discussion";
import { MorningPhase } from "./phases/Morning";
import { NightPhase } from "./phases/Night";
import { ResultsPhase } from "./phases/Results";
import { RevealPhase } from "./phases/Reveal";
import { VoteResultPhase } from "./phases/VoteResult";
import { VotingPhase } from "./phases/Voting";
import { RolePeek } from "./parts";
import { useMafia, useNightTheme } from "./use-mafia";

/** Phases played with the lights off. */
const DARK: MafiaPhase[] = ["reveal", "night"];

function phaseLabel(phase: MafiaPhase, day: number) {
  switch (phase) {
    case "reveal":
      return { Icon: VenetianMask, text: "Roles" };
    case "night":
      return { Icon: Moon, text: `Night ${day}` };
    case "results":
      return { Icon: Trophy, text: "Results" };
    default:
      return { Icon: Sun, text: `Day ${day}` };
  }
}

export function MafiaScreen() {
  const { view, pub, clockOffset, alivePlayers } = useMafia();
  const phase = pub.phase;
  useNightTheme(DARK.includes(phase));
  const { Icon, text } = phaseLabel(phase, pub.day);

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-20 border-b border-line bg-paper">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-safe">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-ink px-2.5 text-sm font-semibold whitespace-nowrap text-paper">
              <Icon className="size-4" />
              {text}
            </span>
            {phase !== "reveal" && phase !== "results" && (
              <span className="truncate text-sm text-muted">
                {alivePlayers.length} of {pub.participants.length} alive
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {phase !== "reveal" && phase !== "results" && <RolePeek />}
            <Countdown endsAt={view.endsAt} clockOffset={clockOffset} />
          </div>
        </div>
        <TimerBar endsAt={view.endsAt} totalMs={pub.phaseMs ?? 30_000} clockOffset={clockOffset} />
      </div>

      <div key={`${phase}-${pub.day}-${pub.voting?.isRevote ?? ""}`} className="mx-auto flex w-full max-w-2xl flex-1 animate-enter flex-col px-safe pt-5">
        {phase === "reveal" && <RevealPhase />}
        {phase === "night" && <NightPhase />}
        {phase === "morning" && <MorningPhase />}
        {phase === "discussion" && <DiscussionPhase />}
        {phase === "voting" && <VotingPhase />}
        {phase === "voteResult" && <VoteResultPhase />}
        {phase === "results" && <ResultsPhase />}
      </div>
    </div>
  );
}
