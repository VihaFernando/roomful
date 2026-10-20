const STEPS = [
  { title: "Get your secret", body: "Everyone sees the same secret word, except the Imposter, who only learns that they're the Imposter." },
  { title: "Give one clue each", body: "Take turns saying one short clue. Show that you know the word without making it obvious." },
  { title: "Discuss", body: "Whose clue didn't quite fit? Talk it over, out loud or in your group chat." },
  { title: "Vote", body: "Everyone votes for who they think is the Imposter. The player with the most votes is out. A tie means one revote between the tied players. If it ties again, nobody goes out." },
];

export function ImposterRules() {
  return (
    <div className="flex flex-col gap-5 pb-2">
      <ol className="flex flex-col gap-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-ink font-mono text-sm font-semibold text-paper">
              {i + 1}
            </span>
            <div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-0.5 text-[15px] text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="font-semibold">Who wins</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-ink-2">
          <li>
            <strong className="text-crew">Crew</strong> wins by voting out the Imposter.
          </li>
          <li>
            <strong className="text-imposter">Imposter</strong> wins if the vote misses. If the host allows it, a surviving Imposter
            can then guess the word for bonus points.
          </li>
          <li>With more than one Imposter, rounds repeat until every Imposter is out or the Imposters match the crew in number.</li>
        </ul>
      </div>
      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="font-semibold">Points</h3>
        <p className="mt-1 text-[15px] text-ink-2">
          Crew win: +2 each, plus +1 if you voted for the Imposter. Imposter win: +3. Guessing the word: +2.
        </p>
      </div>
    </div>
  );
}
