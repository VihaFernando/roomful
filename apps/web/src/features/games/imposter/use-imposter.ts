import { useCallback } from "react";
import type { GameView } from "@party/shared";
import type { ImposterAction, ImposterActionType, ImposterPrivateView, ImposterPublicView } from "@party/shared/games/imposter";
import { RequestError } from "../../../services/room-connection";
import { useConnection, usePlayers, useRoomState } from "../../rooms/room-context";

export type ImposterGameView = GameView<ImposterPublicView, ImposterPrivateView>;

/** Typed access to the current Imposter view plus an action sender. */
export function useImposter() {
  const state = useRoomState();
  const conn = useConnection();
  const players = usePlayers();
  const view = state.game as ImposterGameView;
  const me = state.playerId!;
  const pub = view.public;
  const priv = view.private;
  const seat = pub.participants.find((p) => p.id === me);

  const act = useCallback(
    async (action: ImposterAction): Promise<{ ok: true } | { ok: false; message: string }> => {
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
    can: (t: ImposterActionType) => view.availableActions.includes(t),
    act,
    /** Shows a failed action as a toast. */
    actOrToast: async (action: ImposterAction) => {
      const r = await act(action);
      if (!r.ok) conn.toast(r.message, "error");
      return r.ok;
    },
  };
}
