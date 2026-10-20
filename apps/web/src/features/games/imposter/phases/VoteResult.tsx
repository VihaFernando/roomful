import { Badge } from "../../../../components/ui/Card";
import { cn } from "../../../../components/ui/cn";
import { Avatar } from "../../../players/avatars";
import { useImposter } from "../use-imposter";
import type { VoteRecord } from "@party/shared/games/imposter";

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

export function Tallies({ record }: { record: VoteRecord }) {
  const { players } = useImposter();
  const total = record.tallies.reduce((n, t) => n + t.count, 0);
  if (total === 0) return <p className="text-center text-sm text-muted">Nobody voted.</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label="Vote counts">
      {record.tallies.map((t) => {
        const p = players.get(t.targetId);
        const top = t.targetId === record.eliminatedId;
        return (
          <li key={t.targetId} className="flex items-center gap-3">
            <Avatar id={p.avatarId} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex justify-between text-sm">
                <span className="truncate font-semibold">{p.nickname}</span>
                <span className="font-mono tabular">{t.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-sunk">
                <div className={cn("h-full rounded-full", top ? "bg-accent" : "bg-ink/70")} style={{ width: `${(t.count / total) * 100}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
