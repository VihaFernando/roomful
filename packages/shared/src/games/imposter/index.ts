/**
 * Imposter — contracts shared by server and web.
 * Contains NO secrets: word lists and role logic live in apps/server/src/games/imposter.
 */
import { z } from "zod";

export const IMPOSTER_GAME_ID = "imposter";

export const IMPOSTER_CATEGORIES = [
  { id: "food", label: "Food" },
  { id: "animals", label: "Animals" },
  { id: "places", label: "Places" },
  { id: "objects", label: "Objects" },
  { id: "movies", label: "Movies" },
  { id: "random", label: "Random" },
] as const;
export type ImposterCategoryId = (typeof IMPOSTER_CATEGORIES)[number]["id"];
const categoryIds = IMPOSTER_CATEGORIES.map((c) => c.id) as [ImposterCategoryId, ...ImposterCategoryId[]];

export function categoryLabel(id: string): string {
  return IMPOSTER_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const CLUE_MAX_LENGTH = 40;
export const GUESS_MAX_LENGTH = 40;
/** In elimination mode the match ends with an Imposter win after this many cycles. */
export const MAX_CYCLES = 4;

export const imposterSettingsSchema = z
  .object({
    imposterCount: z.number().int().min(1).max(3).default(1),
    categories: z
      .array(z.enum(categoryIds))
      .min(1, "Pick at least one category")
      .max(categoryIds.length)
      .default(["food", "animals", "places", "objects", "movies"])
      .transform((list) => [...new Set(list)]),
    clueSeconds: z.number().int().min(15).max(90).default(30),
    discussionSeconds: z.number().int().min(15).max(180).default(45),
    voteSeconds: z.number().int().min(15).max(120).default(45),
    clueRoundsPerCycle: z.number().int().min(1).max(3).default(1),
    /**
     * oneVote: a single vote decides the match.
     * elimination: repeat clue → vote cycles until a team wins. Required with 2+ Imposters.
     */
    victoryMode: z.enum(["oneVote", "elimination"]).default("oneVote"),
    /** onSurvive: when the vote misses, surviving Imposters get one guess at the word. */
    imposterGuess: z.enum(["off", "onSurvive"]).default("onSurvive"),
    /** Tell Imposters the category (everyone sees it). */
    revealCategory: z.boolean().default(true),
    showClueAvatars: z.boolean().default(true),
  })
  .strict();

export type ImposterSettings = z.infer<typeof imposterSettingsSchema>;
export type ImposterSettingsInput = z.input<typeof imposterSettingsSchema>;
export const IMPOSTER_DEFAULT_SETTINGS: ImposterSettings = imposterSettingsSchema.parse({});

export const imposterActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reveal.ack") }).strict(),
  z.object({ type: z.literal("clue.submit"), text: z.string().max(200) }).strict(),
  z.object({ type: z.literal("discussion.ready") }).strict(),
  z.object({ type: z.literal("vote.cast"), targetId: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal("guess.submit"), text: z.string().max(200) }).strict(),
]);
export type ImposterAction = z.infer<typeof imposterActionSchema>;
export type ImposterActionType = ImposterAction["type"];

export type ImposterPhase =
  | "reveal"
  | "clues"
  | "discussion"
  | "voting"
  | "voteResult"
  | "guess"
  | "results";

export type ImposterRole = "crew" | "imposter";
export type ImposterTeam = "crew" | "imposters";

export interface ImposterClue {
  cycle: number;
  round: number;
  playerId: string;
  /** null when the player ran out of time. */
  text: string | null;
}

export interface VoteTally {
  targetId: string;
  count: number;
}

export interface VoteRecord {
  cycle: number;
  isRevote: boolean;
  tallies: VoteTally[];
  outcome: "eliminated" | "tie" | "inconclusive";
  eliminatedId: string | null;
}

export interface EliminationReveal {
  playerId: string;
  role: ImposterRole;
}

export interface GuessReveal {
  playerId: string;
  text: string | null;
  correct: boolean;
}

export interface ImposterResultsReveal {
  word: string;
  category: string;
  winner: ImposterTeam;
  reason:
    | "imposters_caught"
    | "crew_voted_wrong"
    | "inconclusive"
    | "imposters_parity"
    | "word_guessed"
    | "cycle_limit";
  roles: EliminationReveal[];
  /** voterId → targetId for every vote, revealed at the end. */
  ballots: { cycle: number; isRevote: boolean; voterId: string; targetId: string }[];
  guesses: GuessReveal[];
}

/** What every participant and spectator may see. */
export interface ImposterPublicView {
  phase: ImposterPhase;
  cycle: number;
  clueRound: number;
  settings: Pick<
    ImposterSettings,
    "imposterCount" | "victoryMode" | "imposterGuess" | "showClueAvatars" | "clueRoundsPerCycle" | "revealCategory"
  >;
  /** Everyone dealt into this match, in seat order. */
  participants: { id: string; alive: boolean }[];
  /** Only set when revealCategory is on (otherwise the category is private to the crew). */
  category: string | null;
  revealConfirmed: string[];
  turnOrder: string[];
  currentTurnId: string | null;
  clues: ImposterClue[];
  discussionReady: string[];
  voting: { isRevote: boolean; candidates: string[]; votedIds: string[] } | null;
  voteHistory: VoteRecord[];
  lastElimination: EliminationReveal | null;
  /**
   * Counts only: who is guessing would expose surviving Imposters in elimination mode.
   * `reveals` is filled once guessing closes and only when it can't leak identities
   * (oneVote mode, or a correct guess that ends the match).
   */
  guess: { guesserCount: number; submittedCount: number; closed: boolean; anyCorrect: boolean | null; reveals: GuessReveal[] } | null;
  results: ImposterResultsReveal | null;
}

/** Secrets for one viewer. Imposter views have no word field at all. */
export type ImposterPrivateView =
  | { role: "crew"; word: string; category: string; myVote: string | null }
  | { role: "imposter"; category: string | null; fellowImposters: string[]; myVote: string | null };

export type ImposterView = { public: ImposterPublicView; private: ImposterPrivateView | null };
