import type { AnyGameModule } from "@party/game-sdk";
import { imposterModule } from "./imposter/module";

/**
 * The game registry. To add a game, implement a GameModule in ./<id>/ and add it here.
 * Order is the order shown in the lobby; the first entry is pre-selected for new rooms.
 */
export const gameModules: readonly AnyGameModule[] = [imposterModule];
