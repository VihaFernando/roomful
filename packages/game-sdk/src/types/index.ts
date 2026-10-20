/** A source of randomness. Production uses crypto; tests use a seeded PRNG. */
export interface Random {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** A player as games see them. Games never get sessions, sockets or room internals. */
export interface PlayerRef {
  id: string;
  nickname: string;
  online: boolean;
}

export type Presence = "online" | "away" | "left";
