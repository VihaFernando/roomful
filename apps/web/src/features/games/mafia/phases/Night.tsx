import { useState } from "react";
import { Check } from "lucide-react";
import type { NightPromptKind } from "@party/shared/games/mafia";
import { cn } from "../../../../components/ui/cn";
import { Spinner } from "../../../../components/ui/Spinner";
import { Avatar } from "../../../players/avatars";
import { ChatPanel } from "../Chat";
import { BottomBar, OutNote, PhaseIntro } from "../parts";
import { useMafia } from "../use-mafia";

// One sentence per role, same length and tone: what a phone shows at night shouldn't be readable as a role.
const PROMPTS: Record<NightPromptKind, { title: string; body: string; verb: string }> = {
  kill: { title: "Who do the Mafia visit?", body: "Your partners see your pick. If you split, one of your picks is chosen at random.", verb: "Target" },
  protect: { title: "Who do you protect?", body: "If the Mafia come for them tonight, they survive.", verb: "Protecting" },
  check: { title: "Who do you investigate?", body: "You'll learn in the morning whether they're Mafia.", verb: "Checking" },
  suspect: { title: "Who do you suspect?", body: "Everyone picks someone at night, so no phone gives a role away.", verb: "Suspecting" },
};

export function NightPhase() {
  const { pub, priv, isParticipant, alive, players } = useMafia();
  const prompt = priv?.prompt;

  if (!isParticipant || !alive || !prompt || !priv) {
    return (
      <>
        <OutNote />
        <PhaseIntro eyebrow={`Night ${pub.day}`} title="The town sleeps" body="Somewhere, the Mafia are choosing. Morning comes when everyone has made their move." />
        {priv?.graveyardChat && <ChatPanel prefer="graveyard" hideTown className="h-[min(50dvh,440px)]" />}
        <BottomBar>
          <NightProgress />
        </BottomBar>
      </>
    );
  }

  const copy = PROMPTS[prompt.kind];
  return (
    <>
      <PhaseIntro eyebrow={`Night ${pub.day}`} title={copy.title} body={copy.body} />
      <TargetList />

      {priv.role === "investigator" && priv.checks && priv.checks.length > 0 && (
        <section className="mt-5 rounded-lg border border-line bg-card px-4 py-3">
          <h2 className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Your findings</h2>
          <ul className="flex flex-col gap-1.5 text-[15px]">
            {priv.checks.map((c) => (
              <li key={c.night} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  <span className="text-muted">Night {c.night} · </span>
                  {players.get(c.targetId).nickname}
                </span>
                <span className={cn("font-semibold", c.team === "mafia" ? "text-imposter" : "text-crew")}>{c.team === "mafia" ? "Mafia" : "Not Mafia"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {priv.role === "doctor" && priv.doctor && (
        <p className="mt-4 text-sm text-muted">
          {priv.doctor.selfSavesLeft === null
            ? "You can protect yourself any night."
            : priv.doctor.selfSavesLeft > 0
              ? "You can protect yourself once this game."
              : "You can't protect yourself again."}
          {priv.doctor.lastProtectedId && ` You can't protect ${players.get(priv.doctor.lastProtectedId).nickname} two nights running.`}
        </p>
      )}

      {priv.role === "mafia" && priv.partners.length > 0 && <ChatPanel prefer="mafia" hideTown className="mt-5 h-[min(40dvh,360px)]" />}

      <BottomBar>
        <div className="flex min-h-12 flex-col justify-center gap-1">
          <p className="text-[15px] font-semibold">
            {prompt.choice ? (
              <>
                {copy.verb}: {players.get(prompt.choice).nickname}
                <span className="font-normal text-muted"> · tap someone else to change</span>
              </>
            ) : (
              "Tap a player to choose"
            )}
          </p>
          <NightProgress />
        </div>
      </BottomBar>
    </>
  );
}

function NightProgress() {
  const { pub } = useMafia();
  if (!pub.night) return null;
  const { done, total } = pub.night;
  return <p className="text-sm text-muted">{done < total ? `${done} of ${total} have made their move` : "Dawn is breaking…"}</p>;
}

function TargetList() {
  const { priv, act, conn, players, me } = useMafia();
  const prompt = priv!.prompt!;
  const [pending, setPending] = useState<string | null>(null);
  const selected = pending ?? prompt.choice;
  // Mafia see where each partner is pointing.
  const partnerPicks = priv!.partnerPicks ?? {};

  async function pick(targetId: string) {
    if (pending || targetId === prompt.choice) return;
    setPending(targetId);
    const r = await act({ type: "night.pick", targetId });
    setPending(null);
    if (!r.ok) conn.toast(r.message, "error");
  }

  return (
    <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Choose a player">
      {prompt.options.map((id) => {
        const p = players.get(id);
        const isSelected = selected === id;
        const pointing = Object.entries(partnerPicks).filter(([, t]) => t === id).map(([who]) => players.get(who).nickname);
        return (
          <li key={id}>
            <button
              role="radio"
              aria-checked={isSelected}
              onClick={() => pick(id)}
              className={cn(
                "flex min-h-16 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-[border-color,background-color] duration-100",
                isSelected ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-line active:bg-sunk",
              )}
            >
              <Avatar id={p.avatarId} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {p.nickname}
                  {id === me && <span className="font-normal text-muted"> (you)</span>}
                </span>
                {pointing.length > 0 && <span className="block truncate text-sm text-ink-2">{pointing.join(", ")} picked them</span>}
              </span>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                  isSelected ? "border-accent bg-accent text-white" : "border-line-strong",
                )}
                aria-hidden="true"
              >
                {pending === id ? <Spinner className="size-3.5" /> : isSelected ? <Check className="size-4" /> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
