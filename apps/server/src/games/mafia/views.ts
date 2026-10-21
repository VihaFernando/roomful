import type { MafiaActionType, MafiaPrivateView, MafiaPublicView, NightPromptKind } from "@party/shared/games/mafia";
import { activePlayers, blockedRepeatId, chatChannel, isActive, nightOptions, selfSavesLeft, type MafiaState } from "./state";

const PROMPT: Record<MafiaState["roles"][string], NightPromptKind> = {
  mafia: "kill",
  doctor: "protect",
  investigator: "check",
  villager: "suspect",
};

/**
 * Built field by field from state. Never spread state here: anything not
 * explicitly listed stays on the server.
 */
export function publicView(s: MafiaState): MafiaPublicView {
  const st = s.settings;
  const active = activePlayers(s);
  return {
    phase: s.phase,
    day: s.day,
    phaseMs: s.phaseMs,
    settings: {
      doctor: st.doctor,
      investigator: st.investigator,
      revealRoleOnDeath: st.revealRoleOnDeath,
      mafiaCount: s.seats.filter((id) => s.roles[id] === "mafia").length,
    },
    participants: s.seats.map((id) => ({
      id,
      alive: isActive(s, id),
      // Players who left are out, but leaving never reveals a role.
      role: st.revealRoleOnDeath && !s.alive[id] && !s.left[id] ? s.roles[id]! : null,
    })),
    revealConfirmed: [...s.revealConfirmed],
    night: s.phase === "night" ? { done: active.filter((id) => s.picks[id] !== undefined).length, total: active.length } : null,
    lastNight: s.lastNight ? { ...s.lastNight } : null,
    discussionReady: [...s.discussionReady],
    voting: s.voting
      ? {
          isRevote: s.voting.isRevote,
          candidates: [...s.voting.candidates],
          // Who has voted — never for whom.
          votedIds: Object.keys(s.voting.ballots),
        }
      : null,
    voteHistory: s.voteHistory.map((v) => ({ ...v, tallies: v.tallies.map((t) => ({ ...t })) })),
    chat: s.chat.town.map((m) => ({ ...m })),
    results:
      s.phase === "results" && s.result
        ? {
            winner: s.result.winner,
            reason: s.result.reason,
            roles: s.seats.map((id) => ({ playerId: id, role: s.roles[id]! })),
            nights: s.nights.map((n) => ({ ...n })),
            ballots: s.ballotLog.map((b) => ({ ...b })),
          }
        : null,
  };
}

/** Only `viewerId`'s own secrets, shaped by their role. */
export function privateView(s: MafiaState, viewerId: string): MafiaPrivateView | null {
  const role = s.roles[viewerId];
  if (!role) return null;
  const active = isActive(s, viewerId);
  const isMafia = role === "mafia";
  const partners = isMafia ? s.seats.filter((id) => id !== viewerId && s.roles[id] === "mafia") : [];
  const night = s.phase === "night" && active;

  return {
    role,
    partners,
    prompt: night ? { kind: PROMPT[role], options: nightOptions(s, viewerId), choice: s.picks[viewerId] ?? null } : null,
    partnerPicks:
      night && isMafia
        ? Object.fromEntries(partners.filter((id) => isActive(s, id) && s.picks[id]).map((id) => [id, s.picks[id]!]))
        : null,
    checks: role === "investigator" ? s.checks.map((c) => ({ ...c })) : null,
    doctor:
      role === "doctor"
        ? { selfSavesLeft: selfSavesLeft(s, viewerId), lastProtectedId: blockedRepeatId(s), saves: s.saves.map((x) => ({ ...x })) }
        : null,
    myVote: s.voting?.ballots[viewerId] ?? null,
    mafiaChat: isMafia ? s.chat.mafia.map((m) => ({ ...m })) : null,
    graveyardChat: s.roles[viewerId] && s.alive[viewerId] === false ? s.chat.graveyard.map((m) => ({ ...m })) : null,
    chatChannel: chatChannel(s, viewerId),
  };
}

export function availableActions(s: MafiaState, viewerId: string): MafiaActionType[] {
  if (!s.roles[viewerId] || s.left[viewerId]) return [];
  const chat: MafiaActionType[] = chatChannel(s, viewerId) ? ["chat.send"] : [];
  if (!isActive(s, viewerId)) return chat;
  switch (s.phase) {
    case "reveal":
      return s.revealConfirmed.includes(viewerId) ? chat : ["role.ack", ...chat];
    case "night":
      return nightOptions(s, viewerId).length > 0 ? ["night.pick", ...chat] : chat;
    case "discussion":
      return s.discussionReady.includes(viewerId) ? chat : ["discussion.ready", ...chat];
    case "voting":
      return ["vote.cast", ...chat];
    default:
      return chat;
  }
}
