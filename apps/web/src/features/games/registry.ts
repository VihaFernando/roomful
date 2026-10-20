import { IMPOSTER_GAME_ID } from "@party/shared/games/imposter";
import { ImposterIcon } from "./imposter/ImposterIcon";
import { ImposterRules } from "./imposter/ImposterRules";
import { ImposterScreen } from "./imposter/ImposterScreen";
import { ImposterSettingsForm, summarizeImposter } from "./imposter/ImposterSettingsForm";
import { defineGameUI, type GameUI } from "./types";

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
};
