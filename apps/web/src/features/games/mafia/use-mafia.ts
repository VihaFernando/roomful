import { useCallback, useEffect } from "react";
import type { GameView } from "@party/shared";
import type { MafiaAction, MafiaActionType, MafiaPrivateView, MafiaPublicView } from "@party/shared/games/mafia";
import { RequestError } from "../../../services/room-connection";
import { useConnection, usePlayers, useRoomState } from "../../rooms/room-context";

export type MafiaGameView = GameView<MafiaPublicView, MafiaPrivateView>;

/** Typed access to the current Mafia view plus an action sender. */
export function useMafia() {
  const state = useRoomState();
  const conn = useConnection();
  const players = usePlayers();
  const view = state.game as MafiaGameView;
  const me = state.playerId!;
  const pub = view.public;
  const priv = view.private;
  const seat = pub.participants.find((p) => p.id === me);

  const act = useCallback(
    async (action: MafiaAction): Promise<{ ok: true } | { ok: false; message: string }> => {
      try {
        await conn.gameAction(action);
        return { ok: true };
      } catch (err) {
        const message = err instanceof RequestError ? err.message : "Something went wrong.";
        return { ok: false, message };
      }
    },
    [conn],
  );

  return {
    conn,
    view,
    pub,
    priv,
    me,
    players,
    clockOffset: state.clockOffset,
    isParticipant: !!seat,
    alive: seat?.alive ?? false,
    alivePlayers: pub.participants.filter((p) => p.alive).map((p) => p.id),
    can: (t: MafiaActionType) => view.availableActions.includes(t),
    act,
    /** Shows a failed action as a toast. */
    actOrToast: async (action: MafiaAction) => {
      const r = await act(action);
      if (!r.ok) conn.toast(r.message, "error");
      return r.ok;
    },
  };
}

const NIGHT_PAPER = "#16140f";
const DAY_PAPER = "#F5F1E8";

/** Switches the whole app to the night palette while `on`, restoring day on unmount. */
export function useNightTheme(on: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    root.classList.toggle("theme-night", on);
    meta?.setAttribute("content", on ? NIGHT_PAPER : DAY_PAPER);
    return () => {
      root.classList.remove("theme-night");
      meta?.setAttribute("content", DAY_PAPER);
    };
  }, [on]);
}
