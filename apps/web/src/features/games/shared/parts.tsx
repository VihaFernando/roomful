import type { ReactNode } from "react";
import { cn } from "../../../components/ui/cn";
import { Avatar } from "../../players/avatars";
import { usePlayers } from "../../rooms/room-context";

/** Game-agnostic building blocks shared by every game screen. */

/** Sticky action area pinned above the home indicator / keyboard. */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-line bg-paper px-4 pt-3 pb-safe">
      {children}
    </div>
  );
}

export function PhaseIntro({ title, body, eyebrow }: { title: ReactNode; body?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow && <div className="mb-1 text-xs font-bold tracking-[0.12em] text-muted uppercase">{eyebrow}</div>}
      <h1 className="font-display text-[28px] leading-tight font-bold tracking-[-0.025em] text-balance">{title}</h1>
      {body && <p className="mt-1.5 text-[15px] text-ink-2 text-pretty">{body}</p>}
    </div>
  );
}

export function WaitingFor({ ids, label }: { ids: string[]; label: string }) {
  const players = usePlayers();
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-1.5">
        {ids.slice(0, 6).map((id) => (
          <Avatar key={id} id={players.get(id).avatarId} size="xs" className="ring-2 ring-paper" />
        ))}
      </div>
      <span className="text-sm text-ink-2">{label}</span>
    </div>
  );
}

/** Horizontal vote bars, most votes first. The eliminated player's bar is the accent. */
export function Tallies({ record }: { record: { tallies: { targetId: string; count: number }[]; eliminatedId: string | null } }) {
  const players = usePlayers();
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
