import { describe, expect, test } from "bun:test";
import { createSeededRandom, isRejection, type GameContext, type PlayerRef, type Step } from "@party/game-sdk";
import { runGameContractSuite } from "@party/game-sdk/testing";
import type { ImposterAction, ImposterSettingsInput } from "@party/shared/games/imposter";
import { imposterSettingsSchema } from "@party/shared/games/imposter";
import { clueRevealsWord, isCorrectGuess } from "./flow";
import { imposterModule as M, maxImposters } from "./module";
import { IMPOSTER_SCORING } from "./scoring";
import type { ImposterState } from "./state";
import { WORD_LISTS, chooseWord } from "./words";

runGameContractSuite(M, { playerCounts: [3, 5, 10] });

/** Deterministic driver: fake clock, seeded random, single phase timer. */
function sim(n: number, settings: ImposterSettingsInput = {}, seed = 1, carryOver?: unknown) {
  const random = createSeededRandom(seed);
  let now = 1_000;
  const players: PlayerRef[] = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, online: true }));
  const ctx = (): GameContext => ({ now, random, players });
  let timerAt: number | null = null;
  const effects: string[] = [];
  const apply = (step: Step<ImposterState>) => {
    for (const e of step.effects ?? []) {
      effects.push(e.kind);
      if (e.kind === "setTimer") timerAt = e.at;
      if (e.kind === "clearTimer") timerAt = null;
    }
    return step.state;
  };
  const parsed = imposterSettingsSchema.parse(settings);
  let state = apply(M.createInitialState(ctx(), { settings: parsed, participants: players, carryOver }));

  const api = {
    get s() {
      return state;
    },
    effects,
    ids: players.map((p) => p.id),
    imposters: () => api.ids.filter((id) => state.roles[id] === "imposter"),
    crew: () => api.ids.filter((id) => state.roles[id] === "crew"),
    act(playerId: string, action: ImposterAction) {
      const r = M.handleAction(ctx(), state, playerId, action);
      if (isRejection(r)) return r;
      state = apply(r);
      return null;
    },
    mustAct(playerId: string, action: ImposterAction) {
      const r = api.act(playerId, action);
      if (r) throw new Error(`rejected: ${r.code} ${r.message}`);
    },
    fire() {
      if (timerAt === null) throw new Error("no timer");
      now = Math.max(now, timerAt);
      timerAt = null;
      state = apply(M.handleTimer(ctx(), state, "phase"));
    },
    presence(playerId: string, p: "online" | "away" | "left") {
      state = apply(M.handlePresence(ctx(), state, playerId, p));
    },
    ackAll() {
      for (const id of api.ids) if (M.getAvailableActions(state, id).includes("reveal.ack")) api.mustAct(id, { type: "reveal.ack" });
    },
    clueAll(text = (id: string) => `hint from ${id}`) {
      while (state.phase === "clues") {
        const id = M.getPublicView(state, "x").currentTurnId!;
        api.mustAct(id, { type: "clue.submit", text: text(id) });
      }
    },
    readyAll() {
      for (const id of api.ids) if (M.getAvailableActions(state, id).includes("discussion.ready")) api.mustAct(id, { type: "discussion.ready" });
    },
    /** Every active player votes for `target(voter)`. */
    voteAll(target: (voter: string) => string) {
      for (const id of api.ids) if (M.getAvailableActions(state, id).includes("vote.cast")) api.mustAct(id, { type: "vote.cast", targetId: target(id) });
    },
    toVoting() {
      api.ackAll();
      api.clueAll();
      api.readyAll();
      expect(state.phase).toBe("voting");
    },
    view(id: string) {
      return { pub: M.getPublicView(state, id), priv: M.getPrivateView(state, id) };
    },
  };
  return api;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("setup", () => {
  test("assigns exactly the configured number of Imposters", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = sim(7, { imposterCount: 2, victoryMode: "elimination" }, seed);
      expect(g.imposters()).toHaveLength(2);
      expect(g.crew()).toHaveLength(5);
    }
  });

  test("every player can be the Imposter (no seat bias)", () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const id = sim(5, {}, seed).imposters()[0]!;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(5);
    for (const c of counts.values()) expect(c).toBeGreaterThan(30);
  });

  test("player-count validation", () => {
    expect(maxImposters(3)).toBe(1);
    expect(maxImposters(4)).toBe(1);
    expect(maxImposters(5)).toBe(2);
    expect(maxImposters(7)).toBe(3);
    const two = imposterSettingsSchema.parse({ imposterCount: 2, victoryMode: "elimination" });
    expect(M.validateSettings(two, 4)).toBe("4 players can only have 1 Imposter.");
    expect(M.validateSettings(two, 5)).toBeNull();
    expect(M.validateSettings(imposterSettingsSchema.parse({ imposterCount: 2 }), 6)).toMatch(/elimination/);
  });

  test("avoids recently used words", () => {
    const recent = WORD_LISTS.food.slice(0, -1);
    for (let seed = 1; seed <= 10; seed++) {
      const g = sim(4, { categories: ["food"] }, seed, { recentWords: recent });
      expect(g.s.word).toBe(WORD_LISTS.food[WORD_LISTS.food.length - 1]!);
    }
    // Falls back to the full pool when everything was used recently.
    expect(chooseWord(createSeededRandom(1), ["food"], WORD_LISTS.food).category).toBe("food");
  });

  test("word lists are clean", () => {
    for (const [cat, words] of Object.entries(WORD_LISTS)) {
      expect(words.length).toBeGreaterThanOrEqual(40);
      expect(new Set(words.map((w) => w.toLowerCase())).size).toBe(words.length);
      for (const w of words) expect(w.trim()).toBe(w);
      expect(cat).toBeTruthy();
    }
  });
});

describe("secret isolation", () => {
  test("Imposters never receive the word in any phase", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = sim(5, {}, seed);
      const word = new RegExp(`\\b${escapeRe(g.s.word)}\\b`, "i");
      const imp = g.imposters()[0]!;
      const check = () => {
        if (g.s.phase === "results") return;
        const { pub, priv } = g.view(imp);
        expect(priv).not.toHaveProperty("word");
        expect(JSON.stringify(pub)).not.toMatch(word);
        expect(JSON.stringify(priv)).not.toMatch(word);
        expect(pub.results).toBeNull();
      };
      check();
      g.ackAll();
      while (g.s.phase === "clues") {
        check();
        const id = g.view("x").pub.currentTurnId!;
        g.mustAct(id, { type: "clue.submit", text: "something" });
      }
      check();
      g.readyAll();
      check();
      g.voteAll((v) => g.crew().find((c) => c !== v)!);
      check();
      while (g.s.phase !== "results") {
        if (M.getAvailableActions(g.s, imp).includes("guess.submit")) g.mustAct(imp, { type: "guess.submit", text: "banana bread" });
        else g.fire();
        check();
      }
    }
  });

  test("crew see the word but nobody sees other players' roles before the end", () => {
    const g = sim(6, {}, 3);
    for (const id of g.crew()) {
      const { pub, priv } = g.view(id);
      expect(priv).toMatchObject({ role: "crew", word: g.s.word });
      expect(priv).not.toHaveProperty("fellowImposters");
      expect(pub.results).toBeNull();
      expect(JSON.stringify(pub)).not.toContain('"role"');
    }
  });

  test("non-participants get no private view", () => {
    const g = sim(4);
    expect(M.getPrivateView(g.s, "spectator")).toBeNull();
    expect(M.getAvailableActions(g.s, "spectator")).toEqual([]);
    expect(isRejection(M.handleAction({ now: 0, random: createSeededRandom(1), players: [] }, g.s, "spectator", { type: "reveal.ack" }))).toBe(true);
  });

  test("Imposters learn their teammates; crew don't", () => {
    const g = sim(7, { imposterCount: 2, victoryMode: "elimination" }, 4);
    const [a, b] = g.imposters();
    expect(g.view(a!).priv).toMatchObject({ role: "imposter", fellowImposters: [b] });
  });

  test("category is hidden from everyone but crew when revealCategory is off", () => {
    const g = sim(4, { revealCategory: false });
    expect(g.view(g.imposters()[0]!).priv).toMatchObject({ role: "imposter", category: null });
    expect(g.view(g.crew()[0]!).pub.category).toBeNull();
    expect(g.view(g.crew()[0]!).priv).toHaveProperty("category");
  });

  test("votes stay secret until voting closes", () => {
    const g = sim(4);
    g.toVoting();
    g.mustAct("p1", { type: "vote.cast", targetId: "p2" });
    const pub = g.view("p3").pub;
    expect(pub.voting?.votedIds).toEqual(["p1"]);
    expect(JSON.stringify(pub)).not.toContain('"targetId"');
    expect(g.view("p3").priv?.myVote).toBeNull();
    expect(g.view("p1").priv?.myVote).toBe("p2");
  });
});

describe("reveal", () => {
  test("advances once every online player confirms", () => {
    const g = sim(4);
    g.mustAct("p1", { type: "reveal.ack" });
    g.mustAct("p1", { type: "reveal.ack" }); // idempotent
    expect(g.s.phase).toBe("reveal");
    g.ackAll();
    expect(g.s.phase).toBe("clues");
  });

  test("an away player doesn't block the reveal", () => {
    const g = sim(4);
    g.presence("p4", "away");
    for (const id of ["p1", "p2", "p3"]) g.mustAct(id, { type: "reveal.ack" });
    expect(g.s.phase).toBe("clues");
  });

  test("times out into the clue round", () => {
    const g = sim(4);
    g.fire();
    expect(g.s.phase).toBe("clues");
  });
});

describe("clue round", () => {
  test("turn order is the seat order rotated to a random start", () => {
    const starts = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const g = sim(5, {}, seed);
      g.ackAll();
      const order = g.s.turnOrder;
      const start = g.s.seats.indexOf(order[0]!);
      expect(order).toEqual([...g.s.seats.slice(start), ...g.s.seats.slice(0, start)]);
      starts.add(order[0]!);
    }
    expect(starts.size).toBe(5);
  });

  test("rejects out-of-turn and repeat clues", () => {
    const g = sim(4);
    g.ackAll();
    const [first, second] = g.s.turnOrder;
    expect(g.act(second!, { type: "clue.submit", text: "x" })?.code).toBe("NOT_YOUR_TURN");
    g.mustAct(first!, { type: "clue.submit", text: "round" });
    expect(g.act(first!, { type: "clue.submit", text: "again" })?.code).toBe("NOT_YOUR_TURN");
    expect(g.s.clues).toHaveLength(1);
  });

  test("validates clue length", () => {
    const g = sim(4);
    g.ackAll();
    const id = g.s.turnOrder[0]!;
    expect(g.act(id, { type: "clue.submit", text: "   " })?.code).toBe("INVALID_ACTION");
    expect(g.act(id, { type: "clue.submit", text: "x".repeat(41) })?.code).toBe("INVALID_ACTION");
  });

  test("crew can't say the word; Imposters are never told", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = sim(4, {}, seed);
      g.ackAll();
      const id = g.s.turnOrder[0]!;
      const r = g.act(id, { type: "clue.submit", text: `it is ${g.s.word}` });
      if (g.s.roles[id] === "crew") expect(r?.code).toBe("INVALID_ACTION");
      else expect(r).toBeNull();
    }
  });

  test("a timeout records an empty clue and moves on", () => {
    const g = sim(4);
    g.ackAll();
    const [first, second] = g.s.turnOrder;
    g.fire();
    expect(g.s.clues[0]).toMatchObject({ playerId: first, text: null });
    expect(g.view("x").pub.currentTurnId).toBe(second!);
  });

  test("multiple clue rounds per cycle", () => {
    const g = sim(3, { clueRoundsPerCycle: 2 });
    g.ackAll();
    g.clueAll();
    expect(g.s.clues).toHaveLength(6);
    expect(g.s.clues.map((c) => c.round)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(g.s.phase).toBe("discussion");
  });

  test("a player who leaves on their turn is skipped", () => {
    const g = sim(5);
    g.ackAll();
    const [first, second] = g.s.turnOrder;
    g.presence(first!, "left");
    expect(g.view("x").pub.currentTurnId).toBe(second!);
  });
});

describe("discussion", () => {
  test("ends early only when everyone is ready, otherwise on the timer", () => {
    const g = sim(4);
    g.ackAll();
    g.clueAll();
    g.mustAct("p1", { type: "discussion.ready" });
    expect(g.s.phase).toBe("discussion");
    g.fire();
    expect(g.s.phase).toBe("voting");
  });
});

describe("voting", () => {
  test("rejects self votes and invalid targets; allows changing a vote", () => {
    const g = sim(4);
    g.toVoting();
    expect(g.act("p1", { type: "vote.cast", targetId: "p1" })?.code).toBe("INVALID_ACTION");
    expect(g.act("p1", { type: "vote.cast", targetId: "nobody" })?.code).toBe("INVALID_ACTION");
    g.mustAct("p1", { type: "vote.cast", targetId: "p2" });
    g.mustAct("p1", { type: "vote.cast", targetId: "p3" });
    expect(g.s.voting!.ballots).toEqual({ p1: "p3" });
  });

  test("closes as soon as everyone has voted; unique leader is eliminated", () => {
    const g = sim(4, {}, 2);
    g.toVoting();
    const imp = g.imposters()[0]!;
    g.voteAll((v) => (v === imp ? g.crew()[0]! : imp));
    expect(g.s.phase).toBe("voteResult");
    expect(g.s.lastElimination).toEqual({ playerId: imp, role: "imposter" });
    g.fire();
    expect(g.s.phase).toBe("results");
    expect(g.s.result).toEqual({ winner: "crew", reason: "imposters_caught" });
  });

  test("a tie goes to a revote among the tied players only", () => {
    const g = sim(4, {}, 5);
    g.toVoting();
    // p1,p2 → p3 ; p3,p4 → p1  => 2–2 tie between p1 and p3
    g.voteAll((v) => (v === "p1" || v === "p2" ? "p3" : "p1"));
    expect(g.s.voteHistory[0]!.outcome).toBe("tie");
    g.fire();
    expect(g.s.phase).toBe("voting");
    expect(g.s.voting).toMatchObject({ isRevote: true, candidates: ["p1", "p3"].sort((a, b) => g.s.seats.indexOf(a) - g.s.seats.indexOf(b)) });
    expect(g.act("p2", { type: "vote.cast", targetId: "p4" })?.code).toBe("INVALID_ACTION");
  });

  test("a tied revote is inconclusive and the Imposter survives", () => {
    const g = sim(4, { imposterGuess: "off" }, 5);
    g.toVoting();
    g.voteAll((v) => (v === "p1" || v === "p2" ? "p3" : "p1"));
    g.fire();
    g.voteAll((v) => (v === "p1" || v === "p2" ? "p3" : "p1"));
    expect(g.s.voteHistory[1]!.outcome).toBe("inconclusive");
    g.fire();
    expect(g.s.result).toEqual({ winner: "imposters", reason: "inconclusive" });
  });

  test("nobody voting counts as a tie between everyone", () => {
    const g = sim(4, { imposterGuess: "off" });
    g.toVoting();
    g.fire();
    expect(g.s.voteHistory[0]!.outcome).toBe("tie");
    g.fire();
    expect(g.s.voting!.candidates).toHaveLength(4);
    g.fire();
    g.fire();
    expect(g.s.result?.reason).toBe("inconclusive");
  });

  test("tie handling is deterministic, not array-order dependent", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const g = sim(4, {}, seed);
      g.toVoting();
      g.voteAll((v) => (v === "p1" || v === "p2" ? "p3" : "p1"));
      outcomes.add(g.s.voteHistory[0]!.outcome);
    }
    expect([...outcomes]).toEqual(["tie"]);
  });
});

describe("victory and the Imposter's guess", () => {
  function missedVote(settings: ImposterSettingsInput = {}, seed = 6) {
    const g = sim(5, settings, seed);
    g.toVoting();
    const imp = g.imposters()[0]!;
    const victim = g.crew()[0]!;
    g.voteAll((v) => (v === victim ? g.crew()[1]! : victim));
    expect(g.s.lastElimination).toEqual({ playerId: victim, role: "crew" });
    g.fire();
    return { g, imp, victim };
  }

  test("oneVote: voting out crew lets the Imposter win, with a chance to guess", () => {
    const { g, imp } = missedVote();
    expect(g.s.phase).toBe("guess");
    expect(M.getAvailableActions(g.s, imp)).toEqual(["guess.submit"]);
    expect(M.getAvailableActions(g.s, g.crew()[1]!)).toEqual([]);
    g.mustAct(imp, { type: "guess.submit", text: ` ${g.s.word.toUpperCase()} ` });
    expect(g.view("x").pub.guess?.reveals).toEqual([{ playerId: imp, text: g.s.word.toUpperCase(), correct: true }]);
    g.fire();
    expect(g.s.result).toEqual({ winner: "imposters", reason: "crew_voted_wrong" });
    const outcome = M.calculateResults(g.s);
    expect(outcome.winnerIds).toEqual([imp]);
    expect(outcome.awards).toContainEqual({ playerId: imp, points: IMPOSTER_SCORING.imposterWin, reason: "Imposter win" });
    expect(outcome.awards).toContainEqual({ playerId: imp, points: IMPOSTER_SCORING.imposterCorrectGuess, reason: "Guessed the word" });
  });

  test("a wrong guess gets no bonus; only one guess", () => {
    const { g, imp } = missedVote();
    g.mustAct(imp, { type: "guess.submit", text: "definitely not it" });
    expect(g.act(imp, { type: "guess.submit", text: "again" })?.code).toBe("WRONG_PHASE");
    g.fire();
    const awards = M.calculateResults(g.s).awards;
    expect(awards.find((a) => a.reason === "Guessed the word")).toBeUndefined();
  });

  test("guess off: straight to results", () => {
    const { g } = missedVote({ imposterGuess: "off" });
    expect(g.s.phase).toBe("results");
  });

  test("crew scoring: win bonus plus a point for voting for the Imposter", () => {
    const g = sim(4, {}, 9);
    g.toVoting();
    const imp = g.imposters()[0]!;
    const [c1, c2, c3] = g.crew();
    // c1, c2 vote imposter; c3 votes c1; imposter votes c1 → imposter 2, c1 2? avoid tie: c3 votes imposter too.
    g.mustAct(c1!, { type: "vote.cast", targetId: imp });
    g.mustAct(c2!, { type: "vote.cast", targetId: imp });
    g.mustAct(imp, { type: "vote.cast", targetId: c1! });
    g.mustAct(c3!, { type: "vote.cast", targetId: c2! });
    g.fire();
    const outcome = M.calculateResults(g.s);
    expect(outcome.winnerIds.sort()).toEqual([c1, c2, c3].sort() as string[]);
    const total = (id: string) => outcome.awards.filter((a) => a.playerId === id).reduce((n, a) => n + a.points, 0);
    expect(total(c1!)).toBe(IMPOSTER_SCORING.crewWin + IMPOSTER_SCORING.crewCaughtImposter);
    expect(total(c3!)).toBe(IMPOSTER_SCORING.crewWin);
    expect(total(imp)).toBe(0);
    expect(outcome.carryOver).toEqual({ recentWords: [g.s.word] });
  });

  test("elimination mode: catching one of two Imposters continues the game", () => {
    const g = sim(7, { imposterCount: 2, victoryMode: "elimination", imposterGuess: "off" }, 11);
    g.toVoting();
    const [i1, i2] = g.imposters();
    g.voteAll((v) => (v === i1 ? g.crew()[0]! : i1!));
    g.fire();
    expect(g.s.phase).toBe("clues");
    expect(g.s.cycle).toBe(2);
    expect(g.s.turnOrder).not.toContain(i1);
    // Eliminated players can't act any more.
    expect(M.getAvailableActions(g.s, i1!)).toEqual([]);
    g.clueAll();
    g.readyAll();
    g.voteAll((v) => (v === i2 ? g.crew()[0]! : i2!));
    g.fire();
    expect(g.s.result).toEqual({ winner: "crew", reason: "imposters_caught" });
  });

  test("elimination mode: Imposters win at parity", () => {
    const g = sim(5, { imposterCount: 2, victoryMode: "elimination", imposterGuess: "off" }, 12);
    // 2 imposters, 3 crew. Vote out one crew → 2 v 2 → parity.
    g.toVoting();
    const victim = g.crew()[0]!;
    g.voteAll((v) => (v === victim ? g.crew()[1]! : victim));
    g.fire();
    expect(g.s.result).toEqual({ winner: "imposters", reason: "imposters_parity" });
  });

  test("elimination mode: the guess phase never exposes who the surviving Imposters are", () => {
    const g = sim(7, { imposterCount: 2, victoryMode: "elimination" }, 13);
    g.toVoting();
    const victim = g.crew()[0]!;
    g.voteAll((v) => (v === victim ? g.crew()[1]! : victim));
    g.fire();
    const [i1, i2] = g.imposters();
    const crewViewer = g.crew()[1]!;
    const check = () => {
      const pub = JSON.stringify(g.view(crewViewer).pub);
      for (const id of [i1!, i2!]) {
        // Imposter ids may appear only in seats/turn order/clues, never tied to guessing.
        expect(g.view(crewViewer).pub.guess).not.toHaveProperty("guesserIds");
        expect(JSON.stringify(g.view(crewViewer).pub.guess)).not.toContain(id);
      }
      return pub;
    };
    check();
    g.mustAct(i1!, { type: "guess.submit", text: "wrong one" });
    check();
    g.mustAct(i2!, { type: "guess.submit", text: "also wrong" });
    check();
    expect(g.view(crewViewer).pub.guess).toMatchObject({ closed: true, anyCorrect: false, reveals: [] });
  });

  test("elimination mode: a correct guess wins immediately", () => {
    const g = sim(7, { imposterCount: 2, victoryMode: "elimination" }, 13);
    g.toVoting();
    const victim = g.crew()[0]!;
    g.voteAll((v) => (v === victim ? g.crew()[1]! : victim));
    g.fire();
    expect(g.s.phase).toBe("guess");
    const [i1, i2] = g.imposters();
    g.mustAct(i1!, { type: "guess.submit", text: "" }); // pass
    g.mustAct(i2!, { type: "guess.submit", text: g.s.word });
    g.fire();
    expect(g.s.result).toEqual({ winner: "imposters", reason: "word_guessed" });
  });
});

describe("presence", () => {
  test("the Imposter leaving aborts the match", () => {
    const g = sim(5);
    g.ackAll();
    g.presence(g.imposters()[0]!, "left");
    expect(g.effects).toContain("abort");
  });

  test("dropping below three players aborts", () => {
    const g = sim(3);
    g.presence(g.crew()[0]!, "left");
    expect(g.effects).toContain("abort");
  });

  test("a voter going away can complete the vote for the rest", () => {
    const g = sim(5, {}, 3);
    g.toVoting();
    const imp = g.imposters()[0]!;
    const [c1, c2, c3, c4] = g.crew();
    for (const v of [c1, c2, c3]) g.mustAct(v!, { type: "vote.cast", targetId: imp });
    g.mustAct(imp, { type: "vote.cast", targetId: c1! });
    expect(g.s.phase).toBe("voting");
    g.presence(c4!, "away");
    expect(g.s.phase).toBe("voteResult");
  });

  test("leaving voter's ballots and votes against them are discarded", () => {
    const g = sim(6, {}, 3);
    g.toVoting();
    const [c1, c2] = g.crew();
    g.mustAct(c1!, { type: "vote.cast", targetId: c2! });
    g.presence(c2!, "left");
    expect(g.s.voting!.ballots).toEqual({});
    expect(g.s.voting!.candidates).not.toContain(c2);
  });
});

describe("text helpers", () => {
  test("clueRevealsWord", () => {
    expect(clueRevealsWord("I love pizza", "Pizza")).toBe(true);
    expect(clueRevealsWord("pizzas!", "Pizza")).toBe(true);
    expect(clueRevealsWord("icecream", "Ice cream")).toBe(true);
    expect(clueRevealsWord("giant", "Ant")).toBe(false);
    expect(clueRevealsWord("cheesy", "Pizza")).toBe(false);
  });

  test("isCorrectGuess is forgiving about case, accents, articles and plurals", () => {
    expect(isCorrectGuess("pizza", "Pizza")).toBe(true);
    expect(isCorrectGuess("Pizzas", "Pizza")).toBe(true);
    expect(isCorrectGuess("the lion king", "The Lion King")).toBe(true);
    expect(isCorrectGuess("lion king", "The Lion King")).toBe(true);
    expect(isCorrectGuess("icecream", "Ice cream")).toBe(true);
    expect(isCorrectGuess("crème brûlée", "Creme brulee")).toBe(true);
    expect(isCorrectGuess("pasta", "Pizza")).toBe(false);
    expect(isCorrectGuess("", "Pizza")).toBe(false);
  });
});
