import { Gavel } from "lucide-react";
import { Avatar } from "../../../players/avatars";
import { RoleBadge, Tallies } from "../parts";
import { useMafia } from "../use-mafia";

export function VoteResultPhase() {
  const { pub, players, me } = useMafia();
  const last = pub.voteHistory[pub.voteHistory.length - 1];
  if (!last) return null;
  const out = last.eliminatedId ? players.get(last.eliminatedId) : null;
  const role = last.eliminatedId ? pub.participants.find((p) => p.id === last.eliminatedId)?.role : null;
  const tied = last.outcome === "tie" ? last.tallies.filter((t) => t.count === last.tallies[0]!.count).map((t) => players.get(t.targetId).nickname) : [];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center py-6 text-center">
        {last.outcome === "eliminated" && out ? (
          <>
            <Avatar id={out.avatarId} size="xl" />
            <h1 className="mt-4 font-display text-[32px] leading-tight font-bold tracking-[-0.03em] text-balance">
              {last.eliminatedId === me ? "The town voted you out" : `${out.nickname} is voted out`}
            </h1>
            <div className="mt-3">
              {role ? <RoleBadge role={role} className="h-8 px-3 text-sm" /> : <p className="text-[15px] text-ink-2">Their role stays a secret.</p>}
            </div>
          </>
        ) : last.outcome === "tie" ? (
          <>
            <Gavel className="size-9 text-ink-2" />
            <h1 className="mt-4 font-display text-[32px] font-bold tracking-[-0.03em]">It's a tie</h1>
            <p className="mt-2 text-[15px] text-ink-2 text-balance">Revote between {tied.join(" and ")}.</p>
          </>
        ) : (
          <>
            <Gavel className="size-9 text-ink-2" />
            <h1 className="mt-4 font-display text-[32px] font-bold tracking-[-0.03em]">Nobody is voted out</h1>
            <p className="mt-2 text-[15px] text-ink-2">{last.tallies.length === 0 ? "Nobody voted." : "The revote tied too."} Night falls again.</p>
          </>
        )}
      </div>
      <Tallies record={last} />
    </div>
  );
}
