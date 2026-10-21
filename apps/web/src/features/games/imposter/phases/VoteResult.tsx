import { Badge } from "../../../../components/ui/Card";
import { Avatar } from "../../../players/avatars";
import { Tallies } from "../../shared/parts";
import { useImposter } from "../use-imposter";

export function VoteResultPhase() {
  const { pub, players } = useImposter();
  const last = pub.voteHistory[pub.voteHistory.length - 1];
  if (!last) return null;
  const out = last.eliminatedId ? players.get(last.eliminatedId) : null;
  const role = pub.lastElimination?.role;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center py-6 text-center">
        {last.outcome === "eliminated" && out ? (
          <>
            <Avatar id={out.avatarId} size="xl" />
            <h1 className="mt-4 font-display text-[32px] leading-tight font-bold tracking-[-0.03em]">{out.nickname} is out</h1>
            <div className="mt-3">
              {role === "imposter" ? (
                <Badge tone="imposter" className="h-8 px-3 text-sm">
                  They were the Imposter
                </Badge>
              ) : (
                <Badge tone="crew" className="h-8 px-3 text-sm">
                  They were crew
                </Badge>
              )}
            </div>
          </>
        ) : last.outcome === "tie" ? (
          <>
            <h1 className="font-display text-[32px] font-bold tracking-[-0.03em]">It's a tie</h1>
            <p className="mt-2 text-[15px] text-ink-2">Revote coming up between the tied players.</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-[32px] font-bold tracking-[-0.03em]">No verdict</h1>
            <p className="mt-2 text-[15px] text-ink-2">The revote tied too, so nobody is voted out.</p>
          </>
        )}
      </div>
      <Tallies record={last} />
    </div>
  );
}

export { Tallies };
