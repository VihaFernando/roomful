import type { ComponentType } from "react";
import type { GameListing } from "@party/shared";

export interface GameSettingsFormProps<S = unknown> {
  settings: S;
  /** Host can edit; everyone else sees a read-only version. */
  editable: boolean;
  /** Online players right now, for player-count dependent limits. */
  playerCount: number;
  onChange: (next: S) => void;
}

export interface GameUI<S = unknown> {
  id: string;
  /** Renders the running match. Reads state through room-context hooks. May be React.lazy. */
  Screen: ComponentType;
  SettingsForm: ComponentType<GameSettingsFormProps<S>>;
  /** Compact how-to-play content shown before the first round and on demand. */
  Rules: ComponentType;
  Icon: ComponentType<{ className?: string }>;
  /** One-line settings summary for the lobby. */
  summarize?: (settings: S, listing: GameListing) => string;
}

/**
 * Type-checks a game's UI against its own settings type, then erases it for the
 * registry. Settings arrive from the server already validated by the game module.
 */
export function defineGameUI<S>(ui: GameUI<S>): GameUI {
  return ui as unknown as GameUI;
}
