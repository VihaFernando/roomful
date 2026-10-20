import { z } from "zod";
import { pick, type Random } from "@party/game-sdk";
import { IMPOSTER_CATEGORIES, type ImposterCategoryId } from "@party/shared/games/imposter";
import animals from "./words/animals.json";
import food from "./words/food.json";
import movies from "./words/movies.json";
import objects from "./words/objects.json";
import places from "./words/places.json";
import random from "./words/random.json";

/**
 * Word lists are server-only. To add words, edit the JSON files; to add a
 * category, add a file here and its id/label to IMPOSTER_CATEGORIES in shared.
 */
const wordFileSchema = z.object({
  category: z.enum(IMPOSTER_CATEGORIES.map((c) => c.id) as [ImposterCategoryId, ...ImposterCategoryId[]]),
  label: z.string().min(1),
  words: z.array(z.string().trim().min(1).max(40)).min(10),
});

export const WORD_LISTS: Record<ImposterCategoryId, string[]> = Object.fromEntries(
  [food, animals, places, objects, movies, random].map((file) => {
    const parsed = wordFileSchema.parse(file);
    return [parsed.category, parsed.words];
  }),
) as Record<ImposterCategoryId, string[]>;

export const RECENT_WORDS_LIMIT = 30;

/** Picks a word from the enabled categories, avoiding recently used words when possible. */
export function chooseWord(
  rng: Random,
  categories: readonly ImposterCategoryId[],
  recent: readonly string[],
): { word: string; category: ImposterCategoryId } {
  const pool = categories.flatMap((category) => (WORD_LISTS[category] ?? []).map((word) => ({ word, category })));
  if (pool.length === 0) throw new Error("no words available");
  const recentSet = new Set(recent.map((w) => w.toLowerCase()));
  const fresh = pool.filter((entry) => !recentSet.has(entry.word.toLowerCase()));
  return pick(rng, fresh.length > 0 ? fresh : pool);
}
