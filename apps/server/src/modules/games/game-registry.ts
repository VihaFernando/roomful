import type { AnyGameModule } from "@party/game-sdk";
import type { GameListing } from "@party/shared";

/** Statically registered game modules. No dynamic code loading. */
export class GameRegistry {
  private modules = new Map<string, AnyGameModule>();

  constructor(modules: readonly AnyGameModule[] = []) {
    for (const m of modules) this.register(m);
  }

  register(module: AnyGameModule) {
    const { id } = module.metadata;
    if (this.modules.has(id)) throw new Error(`Game "${id}" is already registered`);
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Invalid game id "${id}"`);
    this.modules.set(id, module);
  }

  get(id: string): AnyGameModule | undefined {
    return this.modules.get(id);
  }

  has(id: string) {
    return this.modules.has(id);
  }

  ids(): string[] {
    return [...this.modules.keys()];
  }

  listings(): GameListing[] {
    return [...this.modules.values()].map((m) => ({ ...m.metadata, defaultSettings: m.defaultSettings }));
  }
}
