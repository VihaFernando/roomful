import { IMPOSTER_CATEGORIES, type ImposterCategoryId, type ImposterSettings } from "@party/shared/games/imposter";
import { cn } from "../../../components/ui/cn";
import { Segmented, SettingRow, Stepper, Toggle } from "../../../components/ui/Controls";
import type { GameSettingsFormProps } from "../types";

function maxImposters(n: number) {
  return Math.max(1, Math.min(n - 2, Math.ceil(n / 2) - 1, 3));
}

export function ImposterSettingsForm({ settings: s, editable, playerCount, onChange }: GameSettingsFormProps<ImposterSettings>) {
  const set = (patch: Partial<ImposterSettings>) => onChange({ ...s, ...patch });
  const maxImp = maxImposters(Math.max(playerCount, 3));
  const multi = s.imposterCount > 1;

  return (
    <div className="divide-y divide-line">
      <SettingRow label="Imposters" hint={playerCount >= 3 ? `Up to ${maxImp} with ${playerCount} players` : undefined}>
        <Stepper
          label="Imposters"
          value={s.imposterCount}
          min={1}
          max={3}
          disabled={!editable}
          onChange={(v) => set({ imposterCount: v, victoryMode: v > 1 ? "elimination" : s.victoryMode })}
        />
      </SettingRow>

      <SettingRow label="Categories" hint={`${s.categories.length} selected`}>
        <div className="flex flex-wrap gap-2">
          {IMPOSTER_CATEGORIES.map((c) => {
            const on = s.categories.includes(c.id);
            return (
              <button
                key={c.id}
                aria-pressed={on}
                disabled={!editable || (on && s.categories.length === 1)}
                onClick={() =>
                  set({
                    categories: on
                      ? s.categories.filter((x) => x !== c.id)
                      : ([...s.categories, c.id] as ImposterCategoryId[]),
                  })
                }
                className={cn(
                  "h-10 rounded-md border px-3.5 text-sm font-semibold transition-colors",
                  on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink-2 active:bg-sunk",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </SettingRow>

      <SettingRow label="Clue timer">
        <Segmented
          label="Seconds per clue"
          value={s.clueSeconds}
          disabled={!editable}
          onChange={(v) => set({ clueSeconds: v })}
          options={[20, 30, 45, 60].map((v) => ({ value: v, label: `${v}s` }))}
        />
      </SettingRow>

      <SettingRow label="Discussion">
        <Segmented
          label="Discussion length"
          value={s.discussionSeconds}
          disabled={!editable}
          onChange={(v) => set({ discussionSeconds: v })}
          options={[30, 45, 90, 180].map((v) => ({ value: v, label: v >= 60 ? `${v / 60}m` : `${v}s` }))}
        />
      </SettingRow>

      <SettingRow label="Voting">
        <Segmented
          label="Voting length"
          value={s.voteSeconds}
          disabled={!editable}
          onChange={(v) => set({ voteSeconds: v })}
          options={[30, 45, 60, 90].map((v) => ({ value: v, label: `${v}s` }))}
        />
      </SettingRow>

      <SettingRow label="Clues per player">
        <Segmented
          label="Clue rounds"
          value={s.clueRoundsPerCycle}
          disabled={!editable}
          onChange={(v) => set({ clueRoundsPerCycle: v })}
          options={[1, 2, 3].map((v) => ({ value: v, label: String(v) }))}
        />
      </SettingRow>

      <SettingRow label="How it ends" hint={multi ? "Required with 2+ Imposters" : undefined}>
        <Segmented
          label="Victory mode"
          value={s.victoryMode}
          disabled={!editable}
          onChange={(v) => set({ victoryMode: v })}
          options={[
            { value: "oneVote", label: "One vote", disabled: multi },
            { value: "elimination", label: "Until caught" },
          ]}
        />
      </SettingRow>

      <div className="py-1">
        <Toggle
          label="Imposter's last guess"
          description="A surviving Imposter can guess the word"
          checked={s.imposterGuess === "onSurvive"}
          disabled={!editable}
          onChange={(v) => set({ imposterGuess: v ? "onSurvive" : "off" })}
        />
        <Toggle
          label="Show the category"
          description="Tell everyone, including the Imposter, the category"
          checked={s.revealCategory}
          disabled={!editable}
          onChange={(v) => set({ revealCategory: v })}
        />
        <Toggle
          label="Avatars next to clues"
          checked={s.showClueAvatars}
          disabled={!editable}
          onChange={(v) => set({ showClueAvatars: v })}
        />
      </div>
    </div>
  );
}

export function summarizeImposter(s: ImposterSettings): string {
  const cats = s.categories.length === IMPOSTER_CATEGORIES.length ? "All categories" : `${s.categories.length} categories`;
  return `${s.imposterCount} Imposter${s.imposterCount > 1 ? "s" : ""} · ${cats} · ${s.clueSeconds}s clues`;
}
