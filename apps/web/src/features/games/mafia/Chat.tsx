import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { CHAT_MAX_LENGTH, type ChatChannel, type ChatMessage } from "@party/shared/games/mafia";
import { cn } from "../../../components/ui/cn";
import { Spinner } from "../../../components/ui/Spinner";
import { Avatar } from "../../players/avatars";
import { useMafia } from "./use-mafia";

const CHANNEL: Record<ChatChannel, { tab: string; placeholder: string; empty: string }> = {
  town: { tab: "Town", placeholder: "Say something to the town", empty: "Nobody has spoken yet. Who do you trust?" },
  mafia: { tab: "Mafia", placeholder: "Whisper to your partners", empty: "Only your partners can read this." },
  graveyard: { tab: "Ghosts", placeholder: "Talk with the other ghosts", empty: "Only eliminated players can read this." },
};

/** Channels this viewer can read, in tab order. */
function useChannels() {
  const { pub, priv } = useMafia();
  const out: { id: ChatChannel; messages: ChatMessage[] }[] = [{ id: "town", messages: pub.chat }];
  // Only while it's open (at night): a "Mafia" tab on screen by day would give the role away.
  if (priv?.mafiaChat && priv.chatChannel === "mafia") out.push({ id: "mafia", messages: priv.mafiaChat });
  if (priv?.graveyardChat) out.push({ id: "graveyard", messages: priv.graveyardChat });
  return out;
}

/**
 * Chat with a tab per readable channel. You can write only to the channel the
 * server says you're in right now (`chatChannel`); the rest are read-only.
 */
export function ChatPanel({ prefer, className, hideTown }: { prefer?: ChatChannel; className?: string; hideTown?: boolean }) {
  const { priv } = useMafia();
  const channels = useChannels().filter((c) => !(hideTown && c.id === "town"));
  const writable = priv?.chatChannel ?? null;
  const fallback = prefer && channels.some((c) => c.id === prefer) ? prefer : (writable ?? channels[0]?.id ?? "town");
  const [tab, setTab] = useState<ChatChannel>(fallback);
  // Follow the writable channel as phases change (e.g. night → day).
  useEffect(() => setTab(fallback), [fallback]);
  const active = channels.find((c) => c.id === tab) ?? channels[0];
  if (!active) return null;

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-card", className)}>
      {channels.length > 1 && (
        <div role="tablist" aria-label="Chat channels" className="flex border-b border-line">
          {channels.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === active.id}
              onClick={() => setTab(c.id)}
              className={cn(
                "relative h-11 flex-1 text-sm font-semibold transition-colors",
                c.id === active.id ? "text-ink" : "text-muted active:bg-sunk",
              )}
            >
              {CHANNEL[c.id].tab}
              {c.id === active.id && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}
      <MessageList messages={active.messages} empty={CHANNEL[active.id].empty} />
      {writable === active.id ? (
        <Composer channel={active.id} />
      ) : (
        <p className="border-t border-line px-3.5 py-3 text-sm text-muted">
          {active.id === "town" && priv?.chatChannel === "graveyard" ? "Ghosts can read the town but can't talk to it." : "Read only right now."}
        </p>
      )}
    </div>
  );
}

function MessageList({ messages, empty }: { messages: ChatMessage[]; empty: string }) {
  const { players, me } = useMafia();
  const ref = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const lastId = messages[messages.length - 1]?.id;

  // Keep the newest message in view unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  if (messages.length === 0) {
    return <p className="flex flex-1 items-center justify-center px-6 py-8 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <ol
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 py-3"
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((m, i) => {
        const p = players.get(m.playerId);
        const prev = messages[i - 1];
        const grouped = prev?.playerId === m.playerId && prev.day === m.day && m.at - prev.at < 60_000;
        const mine = m.playerId === me;
        return (
          <li key={m.id} className={cn("flex gap-2.5", !grouped && i > 0 && "mt-2.5")}>
            <span className="w-7 shrink-0">{!grouped && <Avatar id={p.avatarId} size="xs" className="mt-0.5 size-7" />}</span>
            <div className="min-w-0 flex-1">
              {!grouped && (
                <div className={cn("text-xs font-semibold", mine ? "text-accent-ink" : "text-muted")}>
                  {p.nickname}
                  {mine && " (you)"}
                </div>
              )}
              <p className="text-[15px] leading-snug break-words text-ink">{m.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Composer({ channel }: { channel: ChatChannel }) {
  const { act, conn } = useMafia();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    const r = await act({ type: "chat.send", text: clean });
    setSending(false);
    if (r.ok) setText("");
    else conn.toast(r.message, "error");
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-1.5 pl-3.5">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LENGTH))}
        enterKeyHint="send"
        autoComplete="off"
        maxLength={CHAT_MAX_LENGTH}
        placeholder={CHANNEL[channel].placeholder}
        aria-label={CHANNEL[channel].placeholder}
        className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/80"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        aria-label="Send message"
        className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-white active:bg-accent-press disabled:bg-sunk disabled:text-muted"
      >
        {sending ? <Spinner className="size-4" /> : <ArrowUp className="size-5" />}
      </button>
    </form>
  );
}
