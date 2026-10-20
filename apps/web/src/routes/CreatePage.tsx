import { useState } from "react";
import { useNavigate } from "react-router";
import { PageShell } from "../components/layout/PageShell";
import { IdentityForm } from "../features/players/IdentityForm";
import { ApiRequestError, api } from "../services/api";
import { sessions } from "../services/storage";

export function CreatePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  return (
    <PageShell back="/">
      <div className="mx-auto w-full max-w-md pt-4 pb-8">
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-[-0.03em]">Start a room</h1>
        <p className="mt-1 mb-6 text-[15px] text-ink-2">You'll be the host. Pick a name your friends will recognise.</p>
        <IdentityForm
          submitLabel="Create room"
          serverError={error}
          onSubmit={async (identity) => {
            setError(null);
            try {
              const grant = await api.createRoom(identity);
              sessions.save(grant);
              navigate(`/r/${grant.code}`, { replace: true });
            } catch (e) {
              setError(e instanceof ApiRequestError ? e.message : "Couldn't create a room. Try again.");
            }
          }}
        />
      </div>
    </PageShell>
  );
}
