import { ROLE_LABEL, type MafiaRole } from "@party/shared/games/mafia";
import { ROLE_META } from "./parts";

const STEPS = [
  { title: "Get your role", body: "The server deals roles in secret. The Mafia learn who their partners are. Everyone else only knows themselves." },
  { title: "Night", body: "Everyone picks someone on their phone. The Mafia choose a target, the Doctor protects, the Investigator checks and Villagers mark a suspect." },
  { title: "Morning", body: "Find out who was killed, or that everyone survived. The Investigator gets their answer in private." },
  { title: "Day", body: "Argue it out in the town chat (or out loud). Accuse, defend, claim a role or bluff." },
  { title: "Vote", body: "Vote in secret for who to eliminate. A tie means one revote between the tied players. If it ties again, nobody goes out." },
];

const ROLES: MafiaRole[] = ["mafia", "doctor", "investigator", "villager"];

export function MafiaRules() {
  return (
    <div className="flex flex-col gap-5 pb-2">
      <ol className="flex flex-col gap-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-ink font-mono text-sm font-semibold text-paper">{i + 1}</span>
            <div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-0.5 text-[15px] text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="font-semibold">Roles</h3>
        <ul className="mt-3 flex flex-col gap-3">
          {ROLES.map((r) => {
            const { Icon, blurb } = ROLE_META[r];
            return (
              <li key={r} className="flex gap-3">
                <Icon className={r === "mafia" ? "mt-0.5 size-5 shrink-0 text-imposter" : "mt-0.5 size-5 shrink-0 text-crew"} />
                <p className="text-[15px] text-ink-2">
                  <strong className="text-ink">{ROLE_LABEL[r]}.</strong> {blurb}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="font-semibold">Who wins</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-ink-2">
          <li>
            <strong className="text-crew">Town</strong> wins when every Mafia member is out.
          </li>
          <li>
            <strong className="text-imposter">Mafia</strong> win once they equal or outnumber everyone else still alive.
          </li>
          <li>Eliminated players become ghosts. They can watch and talk to each other, but the living can't hear them.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="font-semibold">Points</h3>
        <p className="mt-1 text-[15px] text-ink-2">
          Town win: +2 each. Mafia win: +3 each. Surviving on the winning side: +1. The Doctor gets +1 per life saved, the Investigator +1 per Mafia found, and
          the town +1 for voting out a Mafia member.
        </p>
      </div>
    </div>
  );
}
