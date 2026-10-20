import { defineGame, reject, sanitizeLine, shuffle, type Step } from "@party/game-sdk";
import {
  CLUE_MAX_LENGTH,
  GUESS_MAX_LENGTH,
  IMPOSTER_DEFAULT_SETTINGS,
  IMPOSTER_GAME_ID,
  imposterActionSchema,
  imposterSettingsSchema,
  type ImposterAction,
  type ImposterPrivateView,
  type ImposterPublicView,
  type ImposterSettings,
} from "@party/shared/games/imposter";
import {
  PHASE_TIMER,
  advanceTurn,
  afterMiss,
  afterVoteResult,
  clueRevealsWord,
  closeGuess,
  closeVoting,
  enterReveal,
  enterVoting,
  maybeCloseGuess,
  maybeCloseVoting,
  maybeFinishDiscussion,
  maybeFinishReveal,
  recheckWaits,
  recordClue,
  type Fx,
} from "./flow";
import { scoreMatch } from "./scoring";
import { activeCrew, activeImposters, activePlayers, currentTurnId, isActive, type ImposterState } from "./state";
import { availableActions, privateView, publicView } from "./views";
import { chooseWord } from "./words";

/** Most Imposters allowed for a player count: at least 2 crew and fewer Imposters than crew. */
export function maxImposters(playerCount: number): number {
  return Math.max(0, Math.min(playerCount - 2, Math.ceil(playerCount / 2) - 1, 3));
}

function draft(state: ImposterState): ImposterState {
  return structuredClone(state);
}

function readCarryOver(raw: unknown): string[] {
  const words = (raw as { recentWords?: unknown } | undefined)?.recentWords;
  return Array.isArray(words) ? words.filter((w): w is string => typeof w === "string") : [];
}

export const imposterModule = defineGame<
  ImposterSettings,
  ImposterState,
  ImposterAction,
  ImposterPublicView,
  ImposterPrivateView
>({
  metadata: {
    id: IMPOSTER_GAME_ID,
    version: "1.0.0",
    name: "Imposter",
    tagline: "Everyone knows the word. Almost.",
    description:
      "Everyone gets the same secret word except the Imposter. Give one-word clues, find the bluffer, and vote them out before they blend in.",
    icon: "imposter",
    category: "deduction",
    minPlayers: 3,
    maxPlayers: 10,
    estimatedMinutes: [5, 10],
    allowsLateJoin: false,
  },
  settingsSchema: imposterSettingsSchema,
  defaultSettings: IMPOSTER_DEFAULT_SETTINGS,
  actionSchema: imposterActionSchema,

  validateSettings(settings, playerCount) {
    if (settings.imposterCount > 1 && settings.victoryMode !== "elimination") {
      return "More than one Imposter needs elimination mode.";
    }
    const max = maxImposters(playerCount);
    if (settings.imposterCount > max) {
      return max <= 1
        ? `${playerCount} players can only have 1 Imposter.`
        : `${playerCount} players can have at most ${max} Imposters.`;
    }
    return null;
  },

  createInitialState(ctx, { settings, participants, carryOver }) {
    const ids = participants.map((p) => p.id);
    const recentWords = readCarryOver(carryOver);
    const { word, category } = chooseWord(ctx.random, settings.categories, recentWords);
    const impostorIds = new Set(shuffle(ctx.random, ids).slice(0, settings.imposterCount));
    const seats = shuffle(ctx.random, ids);
    const s: ImposterState = {
      settings,
      phase: "reveal",
      phaseEndsAt: null,
      seats,
      roles: Object.fromEntries(ids.map((id) => [id, impostorIds.has(id) ? "imposter" : "crew"])),
      alive: Object.fromEntries(ids.map((id) => [id, true])),
      left: {},
      online: Object.fromEntries(participants.map((p) => [p.id, p.online])),
      word,
      category,
      cycle: 0,
      clueRound: 0,
      revealConfirmed: [],
      turnOrder: [],
      turnIndex: -1,
      clues: [],
      discussionReady: [],
      voting: null,
      pendingRevote: null,
      ballotLog: [],
      voteHistory: [],
      lastElimination: null,
      guess: null,
      guessResults: [],
      guessedIds: [],
      result: null,
      recentWords,
    };
    const fx: Fx = [];
    enterReveal(s, ctx, fx);
    return { state: s, effects: fx };
  },

  handleAction(ctx, state, playerId, action) {
    if (!state.roles[playerId]) return reject("FORBIDDEN", "You're watching this round.");
    if (!isActive(state, playerId)) return reject("FORBIDDEN", "You're out for this round.");
    const s = draft(state);
    const fx: Fx = [];

    switch (action.type) {
      case "reveal.ack": {
        if (s.phase !== "reveal") return reject("WRONG_PHASE", "The reveal is over.");
        if (!s.revealConfirmed.includes(playerId)) s.revealConfirmed.push(playerId);
        maybeFinishReveal(s, ctx, fx);
        break;
      }
      case "clue.submit": {
        if (s.phase !== "clues") return reject("WRONG_PHASE", "It's not time for clues.");
        if (currentTurnId(s) !== playerId) return reject("NOT_YOUR_TURN", "Wait for your turn.");
        const text = sanitizeLine(action.text);
        if (text.length < 1 || text.length > CLUE_MAX_LENGTH) {
          return reject("INVALID_ACTION", `Clues are 1 to ${CLUE_MAX_LENGTH} characters.`);
        }
        // Only checked for crew: rejecting an Imposter's clue would tell them the word.
        if (s.roles[playerId] === "crew" && clueRevealsWord(text, s.word)) {
          return reject("INVALID_ACTION", "That gives the word away. Try another clue.");
        }
        recordClue(s, playerId, text);
        advanceTurn(s, ctx, fx);
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
      case "guess.submit": {
        const g = s.guess;
        if (s.phase !== "guess" || !g || g.closed) return reject("WRONG_PHASE", "Guessing isn't open.");
        if (!g.guesserIds.includes(playerId)) return reject("FORBIDDEN", "Only a surviving Imposter can guess.");
        if (playerId in g.submissions) return reject("INVALID_ACTION", "You've already guessed.");
        const text = sanitizeLine(action.text);
        if (text.length > GUESS_MAX_LENGTH) return reject("INVALID_ACTION", `Guesses are up to ${GUESS_MAX_LENGTH} characters.`);
        // An empty guess is a pass.
        g.submissions[playerId] = text.length > 0 ? text : null;
        maybeCloseGuess(s, ctx, fx);
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
      case "clues": {
        const id = currentTurnId(s);
        if (id) recordClue(s, id, null);
        advanceTurn(s, ctx, fx);
        break;
      }
      case "discussion":
        enterVoting(s, ctx, fx, activePlayers(s), false);
        break;
      case "voting":
        closeVoting(s, ctx, fx);
        break;
      case "voteResult":
        afterVoteResult(s, ctx, fx);
        break;
      case "guess":
        if (s.guess && !s.guess.closed) closeGuess(s, ctx, fx);
        else afterMiss(s, ctx, fx);
        break;
      case "results":
        break;
    }
    return { state: s, effects: fx };
  },

  handlePresence(ctx, state, playerId, presence): Step<ImposterState> {
    if (!state.roles[playerId] || state.phase === "results") return { state };
    const s = draft(state);
    const fx: Fx = [];
    s.online[playerId] = presence === "online";
    if (presence === "left") {
      s.left[playerId] = true;
      if (activeImposters(s).length === 0 || activePlayers(s).length < 3 || activeCrew(s).length === 0) {
        fx.push({ kind: "abort", reason: "not_enough_players" });
        return { state: s, effects: fx };
      }
      if (s.phase === "clues" && currentTurnId(s) === playerId) advanceTurn(s, ctx, fx);
      if (s.phase === "voting" && s.voting) {
        s.voting.candidates = s.voting.candidates.filter((id) => id !== playerId);
        delete s.voting.ballots[playerId];
        for (const [voter, target] of Object.entries(s.voting.ballots)) {
          if (target === playerId) delete s.voting.ballots[voter];
        }
        if (s.voting.candidates.length < 2) closeVoting(s, ctx, fx);
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
