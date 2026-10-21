import { useEffect, useState, type ComponentType } from "react";
import { Eye, EyeOff, House, Search, ShieldPlus, VenetianMask } from "lucide-react";
import { ROLE_LABEL, type MafiaRole } from "@party/shared/games/mafia";
import { Badge } from "../../../components/ui/Card";
import { cn } from "../../../components/ui/cn";
import { Avatar } from "../../players/avatars";
import { useMafia } from "./use-mafia";

export { BottomBar, PhaseIntro, Tallies, WaitingFor } from "../shared/parts";

export const ROLE_META: Record<MafiaRole, { Icon: ComponentType<{ className?: string }>; blurb: string; goal: string }> = {
  mafia: {
    Icon: VenetianMask,
    blurb: "Each night, you and your partners pick someone to eliminate.",
    goal: "Blend in by day. Win once the Mafia equal or outnumber everyone else.",
  },
  doctor: {
    Icon: ShieldPlus,
    blurb: "Each night, pick one player to protect. If the Mafia go for them, they survive.",
    goal: "Keep the town alive and help vote out the Mafia.",
  },
  investigator: {
    Icon: Search,
    blurb: "Each night, check one player. You'll learn privately whether they're Mafia.",
    goal: "Find the Mafia and convince the town without getting yourself killed.",
  },
  villager: {
    Icon: House,
    blurb: "No night power, just your instincts. At night you mark who you suspect.",
    goal: "Read the room, argue it out and vote out every Mafia member.",
  },
};

/** Team-coloured role badge. Only used where a role is already public (or it's your own). */
export function RoleBadge({ role, className }: { role: MafiaRole; className?: string }) {
  const { Icon } = ROLE_META[role];
  return (
    <Badge tone={role === "mafia" ? "imposter" : "crew"} className={className}>
      <Icon className="size-3.5" />
      {ROLE_LABEL[role]}
    </Badge>
  );
}

export function PlayerTag({ id, size = "sm", className }: { id: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const { players, me, pub } = useMafia();
  const p = players.get(id);
  const dead = pub.participants.find((x) => x.id === id)?.alive === false;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar id={p.avatarId} size={size} dimmed={dead || p.presence === "gone"} />
      <span className="truncate font-semibold">
        <span className={cn(dead && "text-muted line-through decoration-1")}>{p.nickname}</span>
        {id === me && <span className="ml-1 font-normal text-muted">(you)</span>}
      </span>
    </span>
  );
}

/** Tap to peek at your role mid-game; hides itself again after a few seconds. */
export function RolePeek() {
  const { priv } = useMafia();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), 4000);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!priv) return null;
  const { Icon } = ROLE_META[priv.role];
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors",
        // Same styling for every role, so the open state can't be read from across the room.
        open ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink-2",
      )}
      aria-label={open ? "Hide your role" : "Peek at your role"}
    >
      {open ? <Icon className="size-4 shrink-0" /> : <Eye className="size-4 shrink-0" />}
      <span>{open ? ROLE_LABEL[priv.role] : "Your role"}</span>
      {open && <EyeOff className="size-3.5 shrink-0 opacity-60" />}
    </button>
  );
}

/** Banner for players who can't act: the eliminated and spectators. */
export function OutNote() {
  const { isParticipant, alive } = useMafia();
  if (isParticipant && alive) return null;
  return (
    <div className="mb-4 rounded-md border border-line bg-sunk px-3.5 py-2.5 text-sm text-ink-2">
      {isParticipant
        ? "You're out. Watch the rest of the game and talk with the other ghosts. The living can't hear you."
        : "You're watching this game. You'll be dealt in next time."}
    </div>
  );
}

/** Seat-ordered avatar row showing who's alive. */
export function TownStrip() {
  const { pub, players } = useMafia();
  return (
    <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1" aria-label="Players">
      {pub.participants.map((p) => {
        const info = players.get(p.id);
        return (
          <li key={p.id} className="flex w-14 shrink-0 flex-col items-center gap-1">
            <Avatar id={info.avatarId} size="md" dimmed={!p.alive} />
            <span className={cn("w-full truncate text-center text-xs", p.alive ? "text-ink-2" : "text-muted line-through")}>{info.nickname}</span>
          </li>
        );
      })}
    </ul>
  );
}
