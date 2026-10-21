import { lazy } from "react";
import { IMPOSTER_GAME_ID } from "@party/shared/games/imposter";
import { MAFIA_GAME_ID } from "@party/shared/games/mafia";
import { ImposterIcon } from "./imposter/ImposterIcon";
import { ImposterRules } from "./imposter/ImposterRules";
import { ImposterSettingsForm, summarizeImposter } from "./imposter/ImposterSettingsForm";
import { MafiaIcon } from "./mafia/MafiaIcon";
import { MafiaRules } from "./mafia/MafiaRules";
import { MafiaSettingsForm, summarizeMafia } from "./mafia/MafiaSettingsForm";
import { defineGameUI, type GameUI } from "./types";

// In-game screens load on demand: the lobby only needs icons, rules and settings.
const ImposterScreen = lazy(() => import("./imposter/ImposterScreen").then((m) => ({ default: m.ImposterScreen })));
const MafiaScreen = lazy(() => import("./mafia/MafiaScreen").then((m) => ({ default: m.MafiaScreen })));

/**
 * Frontend half of the game registry: maps a server game id to its screens.
 * Metadata (name, player counts…) comes from the server via /api/games.
 */
export const gameUIs: Record<string, GameUI> = {
  [IMPOSTER_GAME_ID]: defineGameUI({
    id: IMPOSTER_GAME_ID,
    Screen: ImposterScreen,
    SettingsForm: ImposterSettingsForm,
    Rules: ImposterRules,
    Icon: ImposterIcon,
    summarize: summarizeImposter,
  }),
  [MAFIA_GAME_ID]: defineGameUI({
    id: MAFIA_GAME_ID,
    Screen: MafiaScreen,
    SettingsForm: MafiaSettingsForm,
    Rules: MafiaRules,
    Icon: MafiaIcon,
    summarize: summarizeMafia,
  }),
};
