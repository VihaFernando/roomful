import { useEffect, useState } from "react";
import type { GameListing } from "@party/shared";
import { api } from "../../services/api";

let cache: GameListing[] | null = null;
let inflight: Promise<GameListing[]> | null = null;

function load() {
  inflight ??= api
    .games()
    .then((r) => (cache = r.games))
    .finally(() => (inflight = null));
  return inflight;
}

/** Game metadata from the server registry (fetched once per page load). */
export function useGames() {
  const [games, setGames] = useState<GameListing[] | null>(cache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    load()
      .then((g) => alive && setGames(g))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  return { games, error };
}
