import { useState, type FormEvent } from "react";
import { AVATAR_IDS, NICKNAME_MAX, nicknameSchema, type AvatarId } from "@party/shared";
import { Button } from "../../components/ui/Button";
import { cn } from "../../components/ui/cn";
import { TextField } from "../../components/ui/Field";
import { identity as savedIdentity } from "../../services/storage";
import { AVATARS, Avatar } from "./avatars";

function randomAvatar(): AvatarId {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)]!;
}

/** Nickname + avatar. Remembers the last identity on this device. */
export function IdentityForm({
  submitLabel,
  onSubmit,
  serverError,
  disabledAvatars = [],
}: {
  submitLabel: string;
  onSubmit: (v: { nickname: string; avatarId: AvatarId }) => Promise<void>;
  serverError?: string | null;
  disabledAvatars?: string[];
}) {
  const saved = savedIdentity.get();
  const [nickname, setNickname] = useState(saved?.nickname ?? "");
  const [avatarId, setAvatarId] = useState<AvatarId>(saved?.avatarId ?? randomAvatar());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Pick a nickname");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      savedIdentity.save({ nickname: parsed.data, avatarId });
      await onSubmit({ nickname: parsed.data, avatarId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="flex items-end gap-3">
        <Avatar id={avatarId} size="lg" label={AVATARS[avatarId].label} />
        <TextField
          className="flex-1"
          label="Your name"
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            if (error) setError(null);
          }}
          maxLength={NICKNAME_MAX + 4}
          placeholder="What friends call you"
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          error={error}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-2">Pick a critter</legend>
        <div className="grid grid-cols-8 gap-1.5 max-[360px]:grid-cols-6" role="radiogroup">
          {AVATAR_IDS.map((id) => {
            const taken = disabledAvatars.includes(id) && id !== avatarId;
            return (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={id === avatarId}
                aria-label={AVATARS[id].label}
                onClick={() => setAvatarId(id)}
                className={cn(
                  "rounded-md p-0.5 transition-[box-shadow] duration-100",
                  id === avatarId ? "ring-2 ring-ink" : "ring-1 ring-transparent active:ring-line-strong",
                  taken && "opacity-50",
                )}
              >
                <Avatar id={id} size="md" className="!size-full aspect-square" />
              </button>
            );
          })}
        </div>
      </fieldset>

      {serverError && (
        <p className="rounded-md border border-imposter/25 bg-imposter-soft px-3.5 py-3 text-sm font-medium text-imposter" role="alert">
          {serverError}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" block loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
