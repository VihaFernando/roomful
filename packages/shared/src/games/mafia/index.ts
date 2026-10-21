/**
 * Mafia — contracts shared by server and web.
 * Contains NO secrets: role assignment and night resolution live in apps/server/src/games/mafia.
 */
import { z } from "zod";

export const MAFIA_GAME_ID = "mafia";

export const MAFIA_MIN_PLAYERS = 5;
export const MAFIA_MAX_PLAYERS = 10;
export const CHAT_MAX_LENGTH = 200;
/** Messages kept per chat channel; older ones drop off. */
export const CHAT_HISTORY_LIMIT = 80;
/** The match ends with a Mafia win if the town hasn't won after this many days. */
export const MAX_DAYS = 10;

/** Fixed phase lengths (ms). Configurable ones come from settings. */
export const MAFIA_FIXED_MS = { reveal: 45_000, morning: 8_000, voteResult: 6_000 } as const;

/** Recommended Mafia count: 1 for 5–6 players, 2 for 7–10. */
export function autoMafiaCount(playerCount: number): number {
  return playerCount >= 7 ? 2 : 1;
}

/** Most Mafia allowed: they must start as a strict minority. */
export function maxMafia(playerCount: number): number {
  return Math.max(1, Math.min(3, Math.ceil(playerCount / 2) - 1));
}

export const mafiaSettingsSchema = z
  .object({
    /** "auto" follows autoMafiaCount; a number fixes it. */
    mafiaCount: z.union([z.literal("auto"), z.number().int().min(1).max(3)]).default("auto"),
    doctor: z.boolean().default(true),
    investigator: z.boolean().default(true),
    /** Show an eliminated player's role to everyone. */
    revealRoleOnDeath: z.boolean().default(true),
    /** How often the Doctor may protect themselves. */
    doctorSelfSave: z.enum(["never", "once", "always"]).default("once"),
    /** Allow protecting the same player two nights in a row. */
    doctorRepeat: z.boolean().default(false),
    nightSeconds: z.number().int().min(20).max(120).default(40),
    discussionSeconds: z.number().int().min(30).max(300).default(120),
    voteSeconds: z.number().int().min(15).max(120).default(45),
  })
  .strict();

export type MafiaSettings = z.infer<typeof mafiaSettingsSchema>;
export type MafiaSettingsInput = z.input<typeof mafiaSettingsSchema>;
export const MAFIA_DEFAULT_SETTINGS: MafiaSettings = mafiaSettingsSchema.parse({});

export function resolvedMafiaCount(settings: Pick<MafiaSettings, "mafiaCount">, playerCount: number): number {
  return settings.mafiaCount === "auto" ? autoMafiaCount(playerCount) : settings.mafiaCount;
}

export const mafiaActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("role.ack") }).strict(),
  /** Night pick. Meaning depends on the sender's role (kill, protect, check or suspect). */
  z.object({ type: z.literal("night.pick"), targetId: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal("discussion.ready") }).strict(),
  z.object({ type: z.literal("vote.cast"), targetId: z.string().min(1).max(64) }).strict(),
  /** The server picks the channel from the sender's role, phase and whether they're alive. */
  z.object({ type: z.literal("chat.send"), text: z.string().max(400) }).strict(),
]);
export type MafiaAction = z.infer<typeof mafiaActionSchema>;
export type MafiaActionType = MafiaAction["type"];

export type MafiaPhase = "reveal" | "night" | "morning" | "discussion" | "voting" | "voteResult" | "results";
export type MafiaRole = "mafia" | "doctor" | "investigator" | "villager";
export type MafiaTeam = "town" | "mafia";
export type ChatChannel = "town" | "mafia" | "graveyard";

export function teamOf(role: MafiaRole): MafiaTeam {
  return role === "mafia" ? "mafia" : "town";
}

export const ROLE_LABEL: Record<MafiaRole, string> = {
  mafia: "Mafia",
  doctor: "Doctor",
  investigator: "Investigator",
  villager: "Villager",
};

export interface ChatMessage {
  id: number;
  channel: ChatChannel;
  playerId: string;
  text: string;
  day: number;
  at: number;
}

export interface VoteTally {
  targetId: string;
  count: number;
}

export interface MafiaVoteRecord {
  day: number;
  isRevote: boolean;
  tallies: VoteTally[];
  /** tie → a revote follows; none → nobody eliminated. */
  outcome: "eliminated" | "tie" | "none";
  eliminatedId: string | null;
}

/** What a night pick means for the viewer. Villagers "suspect" so every phone looks busy at night. */
export type NightPromptKind = "kill" | "protect" | "check" | "suspect";

export interface NightRecord {
  night: number;
  /** Who the Mafia went for (null if they picked nobody). */
  targetId: string | null;
  protectedId: string | null;
  checkedId: string | null;
  killedId: string | null;
}

export interface MafiaResultsReveal {
  winner: MafiaTeam;
  reason: "mafia_eliminated" | "mafia_parity" | "day_limit";
  roles: { playerId: string; role: MafiaRole }[];
  nights: NightRecord[];
  /** voterId → targetId for every day vote, revealed at the end. */
  ballots: { day: number; isRevote: boolean; voterId: string; targetId: string }[];
}

/** What every participant and spectator may see. */
export interface MafiaPublicView {
  phase: MafiaPhase;
  /** Night n is followed by day n. */
  day: number;
  /** Length of the current phase, for timer bars. */
  phaseMs: number | null;
  settings: Pick<MafiaSettings, "doctor" | "investigator" | "revealRoleOnDeath"> & { mafiaCount: number };
  /** Everyone dealt in, in seat order. `role` is set only once it is public. */
  participants: { id: string; alive: boolean; role: MafiaRole | null }[];
  revealConfirmed: string[];
  /** Counts only: who has acted at night would expose roles. */
  night: { done: number; total: number } | null;
  /** Morning news for the night just resolved. */
  lastNight: { night: number; killedId: string | null } | null;
  discussionReady: string[];
  voting: { isRevote: boolean; candidates: string[]; votedIds: string[] } | null;
  voteHistory: MafiaVoteRecord[];
  /** Public town square (living players). */
  chat: ChatMessage[];
  results: MafiaResultsReveal | null;
}

export interface MafiaNightPrompt {
  kind: NightPromptKind;
  options: string[];
  choice: string | null;
}

/** Secrets for one viewer. Only the fields for their own role are present. */
export interface MafiaPrivateView {
  role: MafiaRole;
  /** Fellow Mafia (Mafia only). */
  partners: string[];
  /** Tonight's pick, if it's night and the viewer is alive. */
  prompt: MafiaNightPrompt | null;
  /** Mafia only: each partner's pick tonight. */
  partnerPicks: Record<string, string> | null;
  /** Investigator only: every check so far. */
  checks: { night: number; targetId: string; team: MafiaTeam }[] | null;
  /** Doctor only. `stoppedAttack` tells the Doctor their patient was the Mafia's target. */
  doctor: {
    selfSavesLeft: number | null;
    lastProtectedId: string | null;
    saves: { night: number; targetId: string; stoppedAttack: boolean }[];
  } | null;
  myVote: string | null;
  /** Mafia-only chat (Mafia only). */
  mafiaChat: ChatMessage[] | null;
  /** Chat for eliminated players (only once you're out). */
  graveyardChat: ChatMessage[] | null;
  /** Channel a chat.send goes to right now, or null if you can't chat. */
  chatChannel: ChatChannel | null;
}
