import { defineGame, reject, sanitizeLine, shuffle, type Step } from "@party/game-sdk";
import {
  CHAT_MAX_LENGTH,
  MAFIA_DEFAULT_SETTINGS,
  MAFIA_GAME_ID,
  MAFIA_MAX_PLAYERS,
  MAFIA_MIN_PLAYERS,
  mafiaActionSchema,
  mafiaSettingsSchema,
  maxMafia,
  resolvedMafiaCount,
  type MafiaAction,
  type MafiaPrivateView,
  type MafiaPublicView,
  type MafiaRole,
  type MafiaSettings,
} from "@party/shared/games/mafia";
import {
  PHASE_TIMER,
  afterMorning,
  afterVoteResult,
  appendChat,
  checkVictory,
  closeVoting,
  enterReveal,
  enterVoting,
  maybeCloseVoting,
  maybeFinishDiscussion,
  maybeFinishNight,
  maybeFinishReveal,
  recheckWaits,
  resolveNight,
  type Fx,
} from "./flow";
import { scoreMatch } from "./scoring";
import { activeMafia, activePlayers, chatChannel, isActive, nightOptions, type MafiaState } from "./state";
import { availableActions, privateView, publicView } from "./views";

function draft(state: MafiaState): MafiaState {
  return structuredClone(state);
}

/** Roles for a table of `playerCount`, before shuffling. */
export function roleDeck(settings: MafiaSettings, playerCount: number): MafiaRole[] {
  const deck: MafiaRole[] = Array(resolvedMafiaCount(settings, playerCount)).fill("mafia");
  if (settings.doctor) deck.push("doctor");
  if (settings.investigator) deck.push("investigator");
  while (deck.length < playerCount) deck.push("villager");
  return deck;
}

export const mafiaModule = defineGame<MafiaSettings, MafiaState, MafiaAction, MafiaPublicView, MafiaPrivateView>({
  metadata: {
    id: MAFIA_GAME_ID,
    version: "1.0.0",
    name: "Mafia",
    tagline: "Night falls. Someone in this room is lying.",
    description:
      "A secret Mafia picks off the town one night at a time. Protect, investigate, argue it out by day, and vote the killers out before they outnumber you.",
    icon: "mafia",
    category: "deduction",
    minPlayers: MAFIA_MIN_PLAYERS,
    maxPlayers: MAFIA_MAX_PLAYERS,
    estimatedMinutes: [15, 30],
    allowsLateJoin: false,
  },
  settingsSchema: mafiaSettingsSchema,
  defaultSettings: MAFIA_DEFAULT_SETTINGS,
  actionSchema: mafiaActionSchema,

  validateSettings(settings, playerCount) {
    const mafia = resolvedMafiaCount(settings, playerCount);
    const max = maxMafia(playerCount);
    if (mafia > max) return max === 1 ? `${playerCount} players can only have 1 Mafia.` : `${playerCount} players can have at most ${max} Mafia.`;
    return null;
  },

  createInitialState(ctx, { settings, participants }) {
    const ids = participants.map((p) => p.id);
    const deck = shuffle(ctx.random, roleDeck(settings, ids.length));
    const s: MafiaState = {
      settings,
      phase: "reveal",
      phaseEndsAt: null,
      phaseMs: null,
      seats: shuffle(ctx.random, ids),
      roles: Object.fromEntries(ids.map((id, i) => [id, deck[i]!])),
      alive: Object.fromEntries(ids.map((id) => [id, true])),
      left: {},
      online: Object.fromEntries(participants.map((p) => [p.id, p.online])),
      day: 0,
      revealConfirmed: [],
      picks: {},
      nights: [],
      lastNight: null,
      checks: [],
      saves: [],
      discussionReady: [],
      voting: null,
      pendingRevote: null,
      voteHistory: [],
      ballotLog: [],
      chat: { town: [], mafia: [], graveyard: [] },
      nextChatId: 1,
      result: null,
    };
    const fx: Fx = [];
    enterReveal(s, ctx, fx);
    return { state: s, effects: fx };
  },

  handleAction(ctx, state, playerId, action) {
    if (!state.roles[playerId]) return reject("FORBIDDEN", "You're watching this game.");
    if (state.left[playerId]) return reject("FORBIDDEN", "You've left this game.");

    if (action.type === "chat.send") {
      const channel = chatChannel(state, playerId);
      if (!channel) return reject("WRONG_PHASE", "Chat is closed right now.");
      const text = sanitizeLine(action.text);
      if (text.length < 1 || text.length > CHAT_MAX_LENGTH) return reject("INVALID_ACTION", `Messages are 1 to ${CHAT_MAX_LENGTH} characters.`);
      const s = draft(state);
      appendChat(s, ctx, channel, playerId, text);
      return { state: s };
    }

    if (!isActive(state, playerId)) return reject("FORBIDDEN", "You're out. You can still watch and chat with the other ghosts.");
    const s = draft(state);
    const fx: Fx = [];

    switch (action.type) {
      case "role.ack": {
        if (s.phase !== "reveal") return reject("WRONG_PHASE", "The reveal is over.");
        if (!s.revealConfirmed.includes(playerId)) s.revealConfirmed.push(playerId);
        maybeFinishReveal(s, ctx, fx);
        break;
      }
      case "night.pick": {
        if (s.phase !== "night") return reject("WRONG_PHASE", "It's not night.");
        // Same message for every role, so a rejection reveals nothing about the rules you play by.
        if (!nightOptions(s, playerId).includes(action.targetId)) return reject("INVALID_ACTION", "You can't pick that player tonight.");
        s.picks[playerId] = action.targetId;
        maybeFinishNight(s, ctx, fx);
        break;
      }
      case "discussion.ready": {
        if (s.phase !== "discussion") return reject("WRONG_PHASE", "Discussion is over.");
        if (!s.discussionReady.includes(playerId)) s.discussionReady.push(playerId);
        maybeFinishDiscussion(s, ctx, fx);
        break;
      }
      case "vote.cast": {
        if (s.phase !== "voting" || !s.voting) return reject("WRONG_PHASE", "Voting isn't open.");
        if (action.targetId === playerId) return reject("INVALID_ACTION", "You can't vote for yourself.");
        if (!s.voting.candidates.includes(action.targetId) || !isActive(s, action.targetId)) {
          return reject("INVALID_ACTION", "You can't vote for that player.");
        }
        s.voting.ballots[playerId] = action.targetId;
        maybeCloseVoting(s, ctx, fx);
        break;
      }
    }
    return { state: s, effects: fx };
  },

  handleTimer(ctx, state, key) {
    if (key !== PHASE_TIMER || state.phaseEndsAt === null || ctx.now < state.phaseEndsAt) return { state };
    const s = draft(state);
    const fx: Fx = [];
    switch (s.phase) {
      case "reveal":
        // Anyone who didn't confirm still has their role on screen; move on.
        s.revealConfirmed = activePlayers(s);
        maybeFinishReveal(s, ctx, fx);
        if (s.phase === "reveal") {
          // Nobody online: keep waiting in short slices rather than stalling forever.
          s.phaseEndsAt = ctx.now + 15_000;
          fx.push({ kind: "setTimer", key: PHASE_TIMER, at: s.phaseEndsAt });
        }
        break;
      case "night":
        resolveNight(s, ctx, fx);
        break;
      case "morning":
        afterMorning(s, ctx, fx);
        break;
      case "discussion":
        enterVoting(s, ctx, fx, activePlayers(s), false);
        break;
      case "voting":
        closeVoting(s, ctx, fx);
        break;
      case "voteResult":
        afterVoteResult(s, ctx, fx);
        break;
      case "results":
        break;
    }
    return { state: s, effects: fx };
  },

  handlePresence(ctx, state, playerId, presence): Step<MafiaState> {
    if (!state.roles[playerId] || state.phase === "results") return { state };
    const s = draft(state);
    const fx: Fx = [];
    s.online[playerId] = presence === "online";
    if (presence === "left" && !s.left[playerId]) {
      const wasActive = isActive(s, playerId);
      s.left[playerId] = true;
      delete s.picks[playerId];
      if (wasActive) {
        // Without any Mafia left the game can't be won fairly, and three is the smallest table that still works.
        if (activeMafia(s).length === 0 || activePlayers(s).length < 3) {
          fx.push({ kind: "abort", reason: "not_enough_players" });
          return { state: s, effects: fx };
        }
        for (const [picker, target] of Object.entries(s.picks)) if (target === playerId) delete s.picks[picker];
        if (s.phase === "voting" && s.voting) {
          s.voting.candidates = s.voting.candidates.filter((id) => id !== playerId);
          delete s.voting.ballots[playerId];
          for (const [voter, target] of Object.entries(s.voting.ballots)) {
            if (target === playerId) delete s.voting.ballots[voter];
          }
          if (s.voting.candidates.length < 2) {
            closeVoting(s, ctx, fx);
            return { state: s, effects: fx };
          }
        }
        if (s.phase !== "morning" && s.phase !== "voteResult" && s.phase !== "reveal" && checkVictory(s, fx)) {
          return { state: s, effects: fx };
        }
      }
    }
    if (presence !== "online") recheckWaits(s, ctx, fx);
    return { state: s, effects: fx };
  },

  getPhase: (s) => ({ id: s.phase, endsAt: s.phaseEndsAt }),
  getPublicView: (s) => publicView(s),
  getPrivateView: (s, viewerId) => privateView(s, viewerId),
  getAvailableActions: (s, viewerId) => availableActions(s, viewerId),
  isComplete: (s) => s.phase === "results",
  calculateResults: (s) => scoreMatch(s),
});
