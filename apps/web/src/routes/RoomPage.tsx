import { useEffect, useMemo, useState } from "react";
import { DoorClosed, Laptop, SearchX, UserX, Users } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { isValidRoomCode, normalizeRoomCode, type RoomLookup, type SessionGrant } from "@party/shared";
import { PageShell } from "../components/layout/PageShell";
import { Button } from "../components/ui/Button";
import { LoadingScreen } from "../components/ui/Spinner";
import { StatePanel } from "../components/ui/States";
import { IdentityForm } from "../features/players/IdentityForm";
import { formatCode } from "../features/lobby/RoomCodeCard";
import { RoomContext } from "../features/rooms/room-context";
import { RoomShell } from "../features/rooms/RoomShell";
import { ApiRequestError, api } from "../services/api";
import { RoomConnection, type ClosedReason } from "../services/room-connection";
import { sessions } from "../services/storage";

/**
 * /r/:code — resumes a saved session for this room, or lets a newcomer
 * pick a name and join. Deep links from invites land here.
 */
export function RoomPage() {
  const params = useParams();
  const code = normalizeRoomCode(params.code ?? "");
  const [grant, setGrant] = useState<SessionGrant | null>(() => (isValidRoomCode(code) ? sessions.get(code) : null));
  const [closed, setClosed] = useState<ClosedReason | null>(null);

  if (!isValidRoomCode(code)) return <InvalidRoom reason="format" />;
  if (closed && closed !== "replaced") return <ClosedRoom reason={closed} code={code} onRejoin={() => setClosed(null)} />;
  if (!grant) return <JoinRoom code={code} onJoined={setGrant} />;
  return (
    <ConnectedRoom
      key={grant.token}
      grant={grant}
      onInvalid={(reason) => {
        if (reason !== "replaced") {
          sessions.forget(code);
          setGrant(null);
        }
        setClosed(reason);
      }}
      onReclaim={() => setClosed(null)}
      replaced={closed === "replaced"}
    />
  );
}

function ConnectedRoom({
  grant,
  onInvalid,
  replaced,
  onReclaim,
}: {
  grant: SessionGrant;
  onInvalid: (r: ClosedReason) => void;
  replaced: boolean;
  onReclaim: () => void;
}) {
  const [conn, setConn] = useState<RoomConnection | null>(null);
  useEffect(() => {
    const c = new RoomConnection(grant.code, grant.token, onInvalid);
    setConn(c);
    return () => c.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant.token]);

  if (!conn) return <LoadingScreen label="Connecting to the room…" />;
  if (replaced) {
    return (
      <PageShell>
        <StatePanel
          icon={<Laptop className="size-6" />}
          title="Open in another tab"
          body="You joined this room from another tab or device. Only one can be connected at a time."
          actions={
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                onReclaim();
                conn.retry();
              }}
            >
              Use this one instead
            </Button>
          }
        />
      </PageShell>
    );
  }
  return (
    <RoomContext.Provider value={conn}>
      <RoomShell />
    </RoomContext.Provider>
  );
}

function JoinRoom({ code, onJoined }: { code: string; onJoined: (g: SessionGrant) => void }) {
  const [lookup, setLookup] = useState<RoomLookup | null>(null);
  const [lookupError, setLookupError] = useState<ApiRequestError | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .lookupRoom(code)
      .then((r) => alive && setLookup(r))
      .catch((e: ApiRequestError) => alive && setLookupError(e));
    return () => {
      alive = false;
    };
  }, [code]);

  if (lookupError) return <InvalidRoom reason={lookupError.code === "NOT_FOUND" ? "missing" : "network"} />;
  if (!lookup) return <LoadingScreen label="Finding the room…" />;
  if (!lookup.joinable) {
    return (
      <PageShell back="/">
        <StatePanel
          icon={<Users className="size-6" />}
          title="This room is full"
          body={`All ${lookup.capacity} seats are taken. Ask the host to make room, or start your own.`}
          actions={
            <Link to="/create">
              <Button variant="primary" size="lg" block>
                Create a room
              </Button>
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell back="/join">
      <div className="mx-auto w-full max-w-md pt-4 pb-8">
        <p className="text-sm font-semibold text-muted">
          Room <span className="font-mono text-ink">{formatCode(code)}</span> · {lookup.playerCount} {lookup.playerCount === 1 ? "player" : "players"}
          {lookup.status === "in-game" && " · game in progress"}
        </p>
        <h1 className="mt-1 mb-2 font-display text-[32px] leading-tight font-bold tracking-[-0.03em]">Who's joining?</h1>
        <p className="mb-6 text-[15px] text-ink-2">
          {lookup.status === "in-game"
            ? "A round is underway. You'll watch this one and play the next."
            : "Pick a name your friends will recognise."}
        </p>
        <IdentityForm
          submitLabel="Join room"
          serverError={joinError}
          onSubmit={async (identity) => {
            setJoinError(null);
            try {
              const g = await api.joinRoom(code, identity);
              sessions.save(g);
              onJoined(g);
            } catch (e) {
              setJoinError(e instanceof ApiRequestError ? e.message : "Couldn't join. Try again.");
            }
          }}
        />
      </div>
    </PageShell>
  );
}

function InvalidRoom({ reason }: { reason: "format" | "missing" | "network" }) {
  const navigate = useNavigate();
  const copy = useMemo(
    () =>
      ({
        format: { title: "That's not a room code", body: "Room codes are six letters and numbers, like K7M 2PQ." },
        missing: { title: "Room not found", body: "It may have closed, or the code has a typo. Rooms close after everyone has left for a while." },
        network: { title: "Can't reach the server", body: "Check your connection and try again." },
      })[reason],
    [reason],
  );
  return (
    <PageShell back="/">
      <StatePanel
        icon={<SearchX className="size-6" />}
        title={copy.title}
        body={copy.body}
        tone={reason === "network" ? "error" : "neutral"}
        actions={
          <>
            {reason === "network" ? (
              <Button variant="primary" size="lg" block onClick={() => location.reload()}>
                Try again
              </Button>
            ) : (
              <Button variant="primary" size="lg" block onClick={() => navigate("/join")}>
                Enter a different code
              </Button>
            )}
            <Button size="lg" block onClick={() => navigate("/create")}>
              Create a room
            </Button>
          </>
        }
      />
    </PageShell>
  );
}

function ClosedRoom({ reason, code, onRejoin }: { reason: ClosedReason; code: string; onRejoin: () => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (reason === "left") navigate("/", { replace: true });
  }, [reason, navigate]);
  if (reason === "left") return null;

  const content =
    reason === "kicked"
      ? { icon: <UserX className="size-6" />, title: "You were removed", body: "The host removed you from this room." }
      : reason === "room_closed" || reason === "expired"
        ? { icon: <DoorClosed className="size-6" />, title: "This room has closed", body: "Rooms close once everyone has been away for a while." }
        : { icon: <DoorClosed className="size-6" />, title: "Your session ended", body: "You can rejoin the room as a new player if it's still open." };

  return (
    <PageShell back="/">
      <StatePanel
        {...content}
        actions={
          <>
            {reason !== "room_closed" && reason !== "expired" && (
              <Button variant="primary" size="lg" block onClick={onRejoin}>
                Rejoin {formatCode(code)}
              </Button>
            )}
            <Button variant={reason === "room_closed" || reason === "expired" ? "primary" : "secondary"} size="lg" block onClick={() => navigate("/create")}>
              Start a new room
            </Button>
          </>
        }
      />
    </PageShell>
  );
}
