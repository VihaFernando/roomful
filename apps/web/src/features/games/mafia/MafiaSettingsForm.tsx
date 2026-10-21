import { autoMafiaCount, maxMafia, MAFIA_MIN_PLAYERS, type MafiaSettings } from "@party/shared/games/mafia";
import { Segmented, SettingRow, Toggle } from "../../../components/ui/Controls";
import type { GameSettingsFormProps } from "../types";

const minutes = (v: number) => (v >= 60 ? `${v / 60}m` : `${v}s`);

export function MafiaSettingsForm({ settings: s, editable, playerCount, onChange }: GameSettingsFormProps<MafiaSettings>) {
  const set = (patch: Partial<MafiaSettings>) => onChange({ ...s, ...patch });
  const n = Math.max(playerCount, MAFIA_MIN_PLAYERS);
  const max = maxMafia(n);

  return (
    <div className="divide-y divide-line">
      <SettingRow label="Mafia" hint={`Auto picks ${autoMafiaCount(n)} for ${n} players`}>
        <Segmented
          label="Number of Mafia"
          value={s.mafiaCount}
          disabled={!editable}
          onChange={(v) => set({ mafiaCount: v })}
          options={[
            { value: "auto" as const, label: "Auto" },
            ...([1, 2, 3] as const).map((v) => ({ value: v, label: String(v), disabled: v > max })),
          ]}
        />
      </SettingRow>

      <div className="py-1">
        <Toggle label="Doctor" description="Protects one player each night" checked={s.doctor} disabled={!editable} onChange={(v) => set({ doctor: v })} />
        <Toggle
          label="Investigator"
          description="Checks one player each night"
          checked={s.investigator}
          disabled={!editable}
          onChange={(v) => set({ investigator: v })}
        />
        <Toggle
          label="Reveal roles when someone's out"
          description="Show everyone the role of each eliminated player"
          checked={s.revealRoleOnDeath}
          disabled={!editable}
          onChange={(v) => set({ revealRoleOnDeath: v })}
        />
      </div>

      {s.doctor && (
        <>
          <SettingRow label="Doctor protects themselves">
            <Segmented
              label="Doctor self-protection"
              value={s.doctorSelfSave}
              disabled={!editable}
              onChange={(v) => set({ doctorSelfSave: v })}
              options={[
                { value: "never", label: "Never" },
                { value: "once", label: "Once" },
                { value: "always", label: "Any night" },
              ]}
            />
          </SettingRow>
          <div className="py-1">
            <Toggle
              label="Same patient two nights running"
              description="Let the Doctor protect one player on back-to-back nights"
              checked={s.doctorRepeat}
              disabled={!editable}
              onChange={(v) => set({ doctorRepeat: v })}
            />
          </div>
        </>
      )}

      <SettingRow label="Night">
        <Segmented
          label="Night length"
          value={s.nightSeconds}
          disabled={!editable}
          onChange={(v) => set({ nightSeconds: v })}
          options={[30, 40, 60, 90].map((v) => ({ value: v, label: minutes(v) }))}
        />
      </SettingRow>

      <SettingRow label="Discussion">
        <Segmented
          label="Discussion length"
          value={s.discussionSeconds}
          disabled={!editable}
          onChange={(v) => set({ discussionSeconds: v })}
          options={[60, 120, 180, 300].map((v) => ({ value: v, label: minutes(v) }))}
        />
      </SettingRow>

      <SettingRow label="Voting">
        <Segmented
          label="Voting length"
          value={s.voteSeconds}
          disabled={!editable}
          onChange={(v) => set({ voteSeconds: v })}
          options={[30, 45, 60, 90].map((v) => ({ value: v, label: minutes(v) }))}
        />
      </SettingRow>
    </div>
  );
}

export function summarizeMafia(s: MafiaSettings): string {
  const roles = [s.doctor && "Doctor", s.investigator && "Investigator"].filter(Boolean).join(" + ");
  const mafia = s.mafiaCount === "auto" ? "Auto Mafia" : `${s.mafiaCount} Mafia`;
  return [mafia, roles || "No special roles", `${minutes(s.discussionSeconds)} talk`].join(" · ");
}
