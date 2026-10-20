import { useState } from "react";
import { useNavigate } from "react-router";
import { ROOM_CODE_LENGTH } from "@party/shared";
import { PageShell } from "../components/layout/PageShell";
import { Button } from "../components/ui/Button";
import { CodeInput } from "../components/ui/CodeInput";
import { ApiRequestError, api } from "../services/api";

export function JoinPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(value: string) {
    if (busy || value.length !== ROOM_CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const room = await api.lookupRoom(value);
      if (!room.joinable) setError("That room is full.");
      else navigate(`/r/${value}`);
    } catch (e) {
      setError(e instanceof ApiRequestError && e.code === "NOT_FOUND" ? "No room with that code. Check for typos." : e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell back="/">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col pt-4 pb-8">
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-[-0.03em]">Join a room</h1>
        <p className="mt-1 mb-6 text-[15px] text-ink-2">Enter the six-character code from the host. Pasting works too.</p>
        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={go}
          invalid={!!error}
          autoFocus
        />
        <p className="mt-3 min-h-5 text-sm font-medium text-imposter" role="alert">
          {error}
        </p>
        <div className="mt-auto pt-6">
          <Button variant="primary" size="lg" block disabled={code.length !== ROOM_CODE_LENGTH} loading={busy} onClick={() => go(code)}>
            Continue
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
