import { useState } from "react";
import { ArrowRight, Clock, Users } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { PageShell } from "../components/layout/PageShell";
import { Button } from "../components/ui/Button";
import { CodeInput } from "../components/ui/CodeInput";
import { gameUIs } from "../features/games/registry";
import { useGames } from "../features/games/use-games";

const STEPS = [
  { n: "01", title: "Start a room", body: "No accounts and nothing to install. You're the host." },
  { n: "02", title: "Share the code", body: "Friends type six characters or tap your invite link." },
  { n: "03", title: "Play together", body: "Everyone plays on their own phone. Secrets stay secret." },
];

export function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const { games } = useGames();

  return (
    <PageShell
      right={
        <Link to="/join" className="inline-flex h-11 items-center rounded-md px-3 text-[15px] font-semibold text-ink-2 active:bg-sunk">
          Join
        </Link>
      }
    >
      <section className="grid gap-10 pt-6 pb-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-16">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-sm border border-line bg-card px-2.5 py-1 text-xs font-semibold tracking-[0.06em] text-ink-2 uppercase">
            <span className="size-1.5 rounded-full bg-accent" /> Party games · private rooms
          </p>
          <h1 className="font-display text-[44px] leading-[0.98] font-extrabold tracking-[-0.045em] text-balance sm:text-[60px]">
            One room. Everyone's phone. Nobody trusts anybody.
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-2">
            Start a private room, share a six-letter code, and play social games with your friends, on the sofa or on a call.
          </p>

          <div className="mt-8 flex max-w-md flex-col gap-3">
            <Button variant="primary" size="lg" block onClick={() => navigate("/create")} icon={<ArrowRight className="order-last size-5" />}>
              Create a room
            </Button>
            <div className="rounded-lg border border-line bg-card p-3">
              <label className="mb-2 block text-sm font-semibold text-ink-2">Have a code?</label>
              <CodeInput value={code} onChange={setCode} onComplete={(c) => navigate(`/r/${c}`)} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">On the table</h2>
          {(games ?? []).map((g) => {
            const Icon = gameUIs[g.id]?.Icon;
            return (
              <article key={g.id} className="rounded-xl border border-line bg-card p-5 shadow-card">
                <div className="flex items-start gap-4">
                  {Icon && <Icon className="size-14 shrink-0" />}
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl font-bold tracking-[-0.025em]">{g.name}</h3>
                    <p className="text-[15px] font-medium text-ink-2">{g.tagline}</p>
                  </div>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{g.description}</p>
                <div className="mt-4 flex gap-4 border-t border-line pt-3 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" /> {g.minPlayers}–{g.maxPlayers} players
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-4" /> {g.estimatedMinutes[0]}–{g.estimatedMinutes[1]} min
                  </span>
                </div>
              </article>
            );
          })}
          {!games && <div className="h-48 rounded-xl border border-line bg-sunk" aria-hidden="true" />}
          <p className="px-1 text-sm text-muted">More games are on the way.</p>
        </div>
      </section>

      <section className="border-t border-line py-10">
        <h2 className="mb-6 text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">How it works</h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="font-mono text-sm font-semibold text-accent-ink">{s.n}</span>
              <h3 className="mt-1 font-display text-xl font-bold tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-1 text-[15px] text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </PageShell>
  );
}
