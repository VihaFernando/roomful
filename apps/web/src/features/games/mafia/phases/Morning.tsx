import { Sunrise } from "lucide-react";
import { ROLE_LABEL } from "@party/shared/games/mafia";
import { cn } from "../../../../components/ui/cn";
import { Avatar } from "../../../players/avatars";
import { RoleBadge } from "../parts";
import { useMafia } from "../use-mafia";

export function MorningPhase() {
  const { pub, priv, players, me } = useMafia();
  const news = pub.lastNight;
  if (!news) return null;
  const killed = news.killedId ? players.get(news.killedId) : null;
  const role = news.killedId ? pub.participants.find((p) => p.id === news.killedId)?.role : null;
  const check = priv?.checks?.find((c) => c.night === news.night);
  const save = priv?.doctor?.saves.find((x) => x.night === news.night && x.stoppedAttack);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center py-6 text-center">
        <span className="mb-4 text-xs font-bold tracking-[0.12em] text-muted uppercase">Morning of day {pub.day}</span>
        {killed ? (
          <>
            <Avatar id={killed.avatarId} size="xl" dimmed />
            <h1 className="mt-4 font-display text-[32px] leading-tight font-bold tracking-[-0.03em] text-balance">
              {news.killedId === me ? "You were killed in the night" : `${killed.nickname} was killed in the night`}
            </h1>
            {role ? (
              <div className="mt-3">
                <RoleBadge role={role} className="h-8 px-3 text-sm" />
              </div>
            ) : (
              <p className="mt-2 text-[15px] text-ink-2">Their role stays a secret.</p>
            )}
          </>
        ) : (
          <>
            <span className="flex size-20 items-center justify-center rounded-xl border border-line bg-card">
              <Sunrise className="size-9 text-accent" />
            </span>
            <h1 className="mt-4 font-display text-[32px] leading-tight font-bold tracking-[-0.03em]">Everyone survived the night</h1>
            <p className="mt-2 text-[15px] text-ink-2">Nobody was killed. Was someone protected, or did the Mafia hold back?</p>
          </>
        )}
      </div>

      {/* Private news: only on this phone. Same neutral card for both, so neither stands out. */}
      {(check || save) && (
        <div className="mx-auto w-full max-w-sm rounded-lg border border-line bg-card px-4 py-3.5">
          <div className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Only you know</div>
          {check && (
            <p className="mt-1.5 text-[15px]">
              {players.get(check.targetId).nickname} is{" "}
              <strong className={cn(check.team === "mafia" ? "text-imposter" : "text-crew")}>{check.team === "mafia" ? "Mafia" : "not Mafia"}</strong>.
            </p>
          )}
          {save && (
            <p className="mt-1.5 text-[15px]">
              The Mafia went for {save.targetId === me ? "you" : players.get(save.targetId).nickname}. Your protection saved {save.targetId === me ? "you" : "them"}.
            </p>
          )}
        </div>
      )}

      {priv && news.killedId === me && (
        <p className="mt-6 text-center text-sm text-muted">
          You were the {ROLE_LABEL[priv.role]}. You can keep watching and chat with the other ghosts.
        </p>
      )}
    </div>
  );
}
