import { describe, expect, test } from "bun:test";
import { createSeededRandom, isRejection, type GameContext, type PlayerRef, type Step } from "@party/game-sdk";
import { runGameContractSuite } from "@party/game-sdk/testing";
import {
  CHAT_HISTORY_LIMIT,
  MAX_DAYS,
  autoMafiaCount,
  mafiaSettingsSchema,
  maxMafia,
  type MafiaAction,
  type MafiaRole,
  type MafiaSettingsInput,
  type NightPromptKind,
} from "@party/shared/games/mafia";
import { mafiaModule as M, roleDeck } from "./module";
import { MAFIA_SCORING } from "./scoring";
import type { MafiaState } from "./state";

runGameContractSuite(M, { playerCounts: [5, 7, 10], maxSteps: 6000 });

/** Deterministic driver: fake clock, seeded random, single phase timer. */
function sim(n: number, settings: MafiaSettingsInput = {}, seed = 1) {
  const random = createSeededRandom(seed);
  let now = 1_000;
  const players: PlayerRef[] = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, online: true }));
  const ctx = (): GameContext => ({ now, random, players });
  let timerAt: number | null = null;
  const effects: string[] = [];
  const apply = (step: Step<MafiaState>) => {
    for (const e of step.effects ?? []) {
      effects.push(e.kind);
      if (e.kind === "setTimer") timerAt = e.at;
      if (e.kind === "clearTimer") timerAt = null;
    }
    return step.state;
  };
  let state = apply(M.createInitialState(ctx(), { settings: mafiaSettingsSchema.parse(settings), participants: players, carryOver: undefined }));

  const api = {
    get s() {
      return state;
    },
    effects,
    ids: players.map((p) => p.id),
    with: (role: MafiaRole) => api.ids.filter((id) => state.roles[id] === role),
    one: (role: MafiaRole) => api.with(role)[0]!,
    town: () => api.ids.filter((id) => state.roles[id] !== "mafia"),
    alive: () => api.ids.filter((id) => state.alive[id] && !state.left[id]),
    act(playerId: string, action: MafiaAction) {
      const r = M.handleAction(ctx(), state, playerId, action);
      if (isRejection(r)) return r;
      state = apply(r);
      return null;
    },
    mustAct(playerId: string, action: MafiaAction) {
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
      for (const id of api.ids) if (M.getAvailableActions(state, id).includes("role.ack")) api.mustAct(id, { type: "role.ack" });
      expect(state.phase).toBe("night");
    },
    /**
     * Plays one night. `picks` overrides chosen players; everyone else picks
     * their first valid option (Mafia aim at `kill` if given).
     */
    night(picks: Record<string, string> = {}) {
      expect(state.phase).toBe("night");
      for (const id of api.alive()) {
        const prompt = M.getPrivateView(state, id)!.prompt!;
        const target = picks[id] ?? prompt.options[0]!;
        api.mustAct(id, { type: "night.pick", targetId: target });
      }
      expect(state.phase).toBe("morning");
    },
    readyAll() {
      for (const id of api.ids) if (M.getAvailableActions(state, id).includes("discussion.ready")) api.mustAct(id, { type: "discussion.ready" });
    },
    voteAll(target: (voter: string) => string) {
      for (const id of api.ids) if (M.getAvailableActions(state, id).includes("vote.cast")) api.mustAct(id, { type: "vote.cast", targetId: target(id) });
    },
    /** From morning to an open vote. */
    toVoting() {
      expect(state.phase).toBe("morning");
      api.fire();
      api.readyAll();
      expect(state.phase).toBe("voting");
    },
    view(id: string) {
      return { pub: M.getPublicView(state, id), priv: M.getPrivateView(state, id) };
    },
  };
  return api;
}

/** Everyone protects / checks / suspects someone harmless; the Mafia all go for `victim`. */
function killNight(g: ReturnType<typeof sim>, victim: string) {
  const picks: Record<string, string> = {};
  for (const m of g.with("mafia").filter((id) => g.alive().includes(id))) picks[m] = victim;
  const doc = g.with("doctor")[0];
  if (doc && g.alive().includes(doc)) {
    const opts = g.view(doc).priv!.prompt!.options.filter((x) => x !== victim);
    picks[doc] = opts[0]!;
  }
  g.night(picks);
}

describe("setup", () => {
  test("role deck follows the recommended Mafia count", () => {
    expect(autoMafiaCount(5)).toBe(1);
    expect(autoMafiaCount(6)).toBe(1);
    expect(autoMafiaCount(7)).toBe(2);
    expect(autoMafiaCount(10)).toBe(2);
    const deck = roleDeck(mafiaSettingsSchema.parse({}), 8);
    expect(deck.filter((r) => r === "mafia")).toHaveLength(2);
    expect(deck.filter((r) => r === "doctor")).toHaveLength(1);
    expect(deck.filter((r) => r === "investigator")).toHaveLength(1);
    expect(deck).toHaveLength(8);
    expect(roleDeck(mafiaSettingsSchema.parse({ doctor: false, investigator: false, mafiaCount: 1 }), 5)).toEqual([
      "mafia",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
  });

  test("assigns every role exactly once per game, and every seat can be Mafia", () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const g = sim(6, {}, seed);
      expect(g.with("mafia")).toHaveLength(1);
      expect(g.with("doctor")).toHaveLength(1);
      expect(g.with("investigator")).toHaveLength(1);
      expect(g.with("villager")).toHaveLength(3);
      counts.set(g.one("mafia"), (counts.get(g.one("mafia")) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) expect(c).toBeGreaterThan(25);
  });

  test("Mafia must start as a minority", () => {
    expect(maxMafia(5)).toBe(2);
    expect(maxMafia(7)).toBe(3);
    expect(M.validateSettings(mafiaSettingsSchema.parse({ mafiaCount: 3 }), 6)).toBe("6 players can have at most 2 Mafia.");
    expect(M.validateSettings(mafiaSettingsSchema.parse({ mafiaCount: 3 }), 7)).toBeNull();
    expect(M.validateSettings(mafiaSettingsSchema.parse({}), 5)).toBeNull();
  });

  test("reveal advances when everyone confirms, or on the timer", () => {
    const g = sim(5);
    g.mustAct("p1", { type: "role.ack" });
    expect(g.s.phase).toBe("reveal");
    g.ackAll();
    expect(g.s.day).toBe(1);
    const h = sim(5);
    h.fire();
    expect(h.s.phase).toBe("night");
  });
});

describe("secret isolation", () => {
  test("nobody sees another player's role before it is public", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = sim(8, { revealRoleOnDeath: false }, seed);
      const check = () => {
        if (g.s.phase === "results") return;
        for (const id of g.town()) {
          const { pub, priv } = g.view(id);
          expect(JSON.stringify(pub)).not.toContain('"role":"');
          expect(priv!.partners).toEqual([]);
          expect(priv!.mafiaChat).toBeNull();
          expect(priv!.partnerPicks).toBeNull();
        }
      };
      check();
      g.ackAll();
      check();
      killNight(g, g.town()[0]!);
      check();
    }
  });

  test("Mafia know each other and see partner picks; nobody else does", () => {
    const g = sim(8, {}, 4);
    const [m1, m2] = g.with("mafia");
    expect(g.view(m1!).priv!.partners).toEqual([m2!]);
    g.ackAll();
    const victim = g.town()[0]!;
    g.mustAct(m2!, { type: "night.pick", targetId: victim });
    expect(g.view(m1!).priv!.partnerPicks).toEqual({ [m2!]: victim });
    expect(g.view(m2!).priv!.partnerPicks).toEqual({});
    for (const id of g.town()) expect(JSON.stringify(g.view(id))).not.toContain(`"${m2!}":"${victim}"`);
  });

  test("night activity is public only as counts", () => {
    const g = sim(6, {}, 2);
    g.ackAll();
    g.mustAct(g.one("doctor"), { type: "night.pick", targetId: g.one("doctor") });
    const pub = g.view(g.one("villager")).pub;
    expect(pub.night).toEqual({ done: 1, total: 6 });
    expect(JSON.stringify(pub)).not.toContain("picks");
  });

  test("every living player gets a night prompt with the same shape", () => {
    const g = sim(7, {}, 3);
    g.ackAll();
    const kinds = new Map<MafiaRole, NightPromptKind>([["mafia", "kill"], ["doctor", "protect"], ["investigator", "check"], ["villager", "suspect"]]);
    for (const id of g.ids) {
      const prompt = g.view(id).priv!.prompt!;
      expect(prompt.kind).toBe(kinds.get(g.s.roles[id]!)!);
      expect(prompt.options.length).toBeGreaterThan(0);
      expect(M.getAvailableActions(g.s, id)).toContain("night.pick");
    }
  });

  test("votes stay secret until voting closes", () => {
    const g = sim(5, {}, 1);
    g.ackAll();
    killNight(g, g.town()[0]!);
    g.toVoting();
    const [a, b, c] = g.alive();
    g.mustAct(a!, { type: "vote.cast", targetId: b! });
    const pub = g.view(c!).pub;
    expect(pub.voting?.votedIds).toEqual([a!]);
    expect(JSON.stringify(pub)).not.toContain('"targetId"');
    expect(g.view(c!).priv!.myVote).toBeNull();
    expect(g.view(a!).priv!.myVote).toBe(b!);
  });

  test("spectators get no private view and can't act", () => {
    const g = sim(5);
    expect(M.getPrivateView(g.s, "spectator")).toBeNull();
    expect(M.getAvailableActions(g.s, "spectator")).toEqual([]);
    expect(isRejection(M.handleAction({ now: 0, random: createSeededRandom(1), players: [] }, g.s, "spectator", { type: "chat.send", text: "hi" }))).toBe(true);
  });
});

describe("night", () => {
  test("the Mafia's target dies and morning announces it", () => {
    const g = sim(6, {}, 5);
    g.ackAll();
    const victim = g.one("villager");
    killNight(g, victim);
    expect(g.s.alive[victim]).toBe(false);
    const pub = g.view(victim).pub;
    expect(pub.lastNight).toEqual({ night: 1, killedId: victim });
    expect(pub.participants.find((p) => p.id === victim)!.role).toBe("villager");
  });

  test("a protected target survives and only the Doctor learns why", () => {
    const g = sim(6, {}, 6);
    g.ackAll();
    const victim = g.one("villager");
    const doc = g.one("doctor");
    g.night({ [g.one("mafia")]: victim, [doc]: victim });
    expect(g.s.alive[victim]).toBe(true);
    expect(g.view(victim).pub.lastNight).toEqual({ night: 1, killedId: null });
    expect(g.view(doc).priv!.doctor!.saves).toEqual([{ night: 1, targetId: victim, stoppedAttack: true }]);
    expect(JSON.stringify(g.view(victim).pub)).not.toContain("stoppedAttack");
  });

  test("the Investigator learns the checked player's team, privately", () => {
    const g = sim(7, {}, 7);
    g.ackAll();
    const inv = g.one("investigator");
    const [mafia] = g.with("mafia");
    g.night({ [inv]: mafia! });
    expect(g.view(inv).priv!.checks).toEqual([{ night: 1, targetId: mafia!, team: "mafia" }]);
    expect(g.view(g.one("villager")).priv!.checks).toBeNull();
    expect(JSON.stringify(g.view(g.one("villager")).pub)).not.toContain('"team"');
  });

  test("split Mafia votes go to one of the leaders at random", () => {
    const victims = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const g = sim(8, { doctor: false }, seed);
      g.ackAll();
      const [m1, m2] = g.with("mafia");
      const [t1, t2] = g.town();
      g.night({ [m1!]: t1!, [m2!]: t2! });
      const killed = g.s.lastNight!.killedId!;
      expect([t1, t2]).toContain(killed);
      victims.add(killed === t1 ? "first" : "second");
    }
    expect(victims.size).toBe(2);
  });

  test("Mafia can't target each other; nobody can pick the dead", () => {
    const g = sim(8, {}, 8);
    g.ackAll();
    const [m1, m2] = g.with("mafia");
    expect(g.act(m1!, { type: "night.pick", targetId: m2! })?.code).toBe("INVALID_ACTION");
    expect(g.act(m1!, { type: "night.pick", targetId: m1! })?.code).toBe("INVALID_ACTION");
    const victim = g.one("villager");
    killNight(g, victim);
    g.toVoting();
    g.fire(); // nobody votes
    g.fire(); // into night 2
    expect(g.act(m1!, { type: "night.pick", targetId: victim })?.code).toBe("INVALID_ACTION");
  });

  test("picks can be changed until the night ends; it ends early once everyone online picked", () => {
    const g = sim(5, {}, 9);
    g.ackAll();
    const m = g.one("mafia");
    const [a, b] = g.town();
    g.mustAct(m, { type: "night.pick", targetId: a! });
    g.mustAct(m, { type: "night.pick", targetId: b! });
    expect(g.s.picks[m]).toBe(b!);
    expect(g.s.phase).toBe("night");
    for (const id of g.town()) g.presence(id, "away");
    expect(g.s.phase).toBe("morning");
    expect(g.s.lastNight!.killedId).toBe(b!);
  });

  test("Mafia who don't pick kill nobody", () => {
    const g = sim(5, {}, 10);
    g.ackAll();
    g.fire();
    expect(g.s.lastNight).toEqual({ night: 1, killedId: null });
    expect(g.alive()).toHaveLength(5);
  });

  test("Doctor: one self-save by default and no repeat target on consecutive nights", () => {
    const g = sim(7, { investigator: false }, 11);
    g.ackAll();
    const doc = g.one("doctor");
    expect(g.view(doc).priv!.prompt!.options).toContain(doc);
    g.night({ [doc]: doc, [g.with("mafia")[0]!]: g.one("villager"), [g.with("mafia")[1]!]: g.one("villager") });
    expect(g.view(doc).priv!.doctor!.selfSavesLeft).toBe(0);
    g.toVoting();
    g.fire();
    g.fire();
    expect(g.s.phase).toBe("night");
    const opts = g.view(doc).priv!.prompt!.options;
    expect(opts).not.toContain(doc); // self-save used, and it was also last night's pick
    const other = opts[0]!;
    g.night({ [doc]: other });
    g.toVoting();
    g.fire();
    g.fire();
    if (g.s.phase !== "night") return; // game may have ended
    expect(g.view(doc).priv!.prompt!.options).not.toContain(other);
    expect(g.view(doc).priv!.doctor!.lastProtectedId).toBe(other);
  });

  test("Doctor settings: unlimited self-saves and repeats when allowed", () => {
    const g = sim(6, { doctorSelfSave: "always", doctorRepeat: true }, 12);
    g.ackAll();
    const doc = g.one("doctor");
    g.night({ [doc]: doc, [g.one("mafia")]: doc });
    expect(g.s.alive[doc]).toBe(true);
    g.toVoting();
    g.fire();
    g.fire();
    expect(g.view(doc).priv!.prompt!.options).toContain(doc);
    expect(g.view(doc).priv!.doctor!.selfSavesLeft).toBeNull();

    const h = sim(6, { doctorSelfSave: "never" }, 12);
    h.ackAll();
    expect(h.view(h.one("doctor")).priv!.prompt!.options).not.toContain(h.one("doctor"));
  });
});

describe("day", () => {
  function toDay(n = 7, settings: MafiaSettingsInput = {}, seed = 20) {
    const g = sim(n, settings, seed);
    g.ackAll();
    killNight(g, g.one("villager"));
    g.toVoting();
    return g;
  }

  test("discussion ends early only when everyone is ready, otherwise on the timer", () => {
    const g = sim(5, {}, 21);
    g.ackAll();
    killNight(g, g.one("villager"));
    g.fire();
    expect(g.s.phase).toBe("discussion");
    g.mustAct(g.alive()[0]!, { type: "discussion.ready" });
    expect(g.s.phase).toBe("discussion");
    g.fire();
    expect(g.s.phase).toBe("voting");
  });

  test("dead players can't vote, be voted for or act", () => {
    const g = toDay();
    const dead = g.ids.find((id) => !g.s.alive[id])!;
    expect(M.getAvailableActions(g.s, dead)).toEqual(["chat.send"]);
    expect(g.act(dead, { type: "vote.cast", targetId: g.alive()[0]! })?.code).toBe("FORBIDDEN");
    expect(g.act(g.alive()[0]!, { type: "vote.cast", targetId: dead })?.code).toBe("INVALID_ACTION");
    expect(g.act(g.alive()[0]!, { type: "vote.cast", targetId: g.alive()[0]! })?.code).toBe("INVALID_ACTION");
  });

  test("the player with the most votes is eliminated; changing votes is allowed", () => {
    const g = toDay(7, {}, 22);
    const target = g.with("mafia")[0]!;
    const fallback = g.town().find((id) => g.s.alive[id])!;
    const first = g.alive().find((id) => id !== target)!;
    g.mustAct(first, { type: "vote.cast", targetId: fallback === first ? target : fallback });
    g.mustAct(first, { type: "vote.cast", targetId: target });
    g.voteAll((v) => (v === target ? fallback : target));
    expect(g.s.phase).toBe("voteResult");
    expect(g.s.voteHistory[0]).toMatchObject({ outcome: "eliminated", eliminatedId: target });
    expect(g.view("x").pub.participants.find((p) => p.id === target)!.role).toBe("mafia");
  });

  test("a tie goes to a revote among the tied; a second tie eliminates nobody", () => {
    // 7 players, one killed overnight: 6 alive. a and b vote for each other; the other four split 2–2.
    const g = toDay(7, {}, 23);
    const [a, b, ...rest] = g.alive();
    expect(rest).toHaveLength(4);
    const plan = (v: string) => (v === a ? b! : v === b ? a! : rest.indexOf(v) < 2 ? a! : b!);
    g.voteAll(plan);
    expect(g.s.voteHistory[0]).toMatchObject({ outcome: "tie", eliminatedId: null });
    g.fire();
    expect(g.s.voting).toMatchObject({ isRevote: true, candidates: [a, b] });
    expect(g.act(rest[0]!, { type: "vote.cast", targetId: rest[1]! })?.code).toBe("INVALID_ACTION");
    g.voteAll(plan);
    expect(g.s.voteHistory[1]).toMatchObject({ isRevote: true, outcome: "none", eliminatedId: null });
    g.fire();
    expect(g.s.phase).toBe("night");
    expect(g.alive()).toHaveLength(6);
  });

  test("no votes at all eliminates nobody and night falls again", () => {
    const g = toDay(7, {}, 24);
    const before = g.alive().length;
    g.fire();
    expect(g.s.voteHistory[0]).toMatchObject({ outcome: "none", tallies: [] });
    g.fire();
    expect(g.s.phase).toBe("night");
    expect(g.s.day).toBe(2);
    expect(g.alive()).toHaveLength(before);
  });
});

describe("victory and scoring", () => {
  test("town wins when the last Mafia is voted out", () => {
    const g = sim(5, {}, 30);
    g.ackAll();
    const m = g.one("mafia");
    const victim = g.one("villager");
    killNight(g, victim);
    g.toVoting();
    const someone = g.town().find((id) => g.s.alive[id])!;
    g.voteAll((v) => (v === m ? someone : m));
    g.fire();
    expect(g.s.result).toEqual({ winner: "town", reason: "mafia_eliminated" });
    const outcome = M.calculateResults(g.s);
    expect(outcome.winnerIds.sort()).toEqual(g.town().sort());
    const total = (id: string) => outcome.awards.filter((a) => a.playerId === id).reduce((n, a) => n + a.points, 0);
    expect(total(victim)).toBe(MAFIA_SCORING.townWin); // dead: no survival bonus, didn't vote
    expect(total(someone)).toBe(MAFIA_SCORING.townWin + MAFIA_SCORING.survived + MAFIA_SCORING.votedOutMafia);
    expect(total(m)).toBe(0);
    // Everything is revealed at the end.
    const results = g.view("x").pub.results!;
    expect(results.roles).toHaveLength(5);
    expect(results.nights).toHaveLength(1);
    expect(results.ballots.length).toBeGreaterThan(0);
  });

  test("Mafia win at parity, straight after the night", () => {
    // 5 players, 2 Mafia: one night kill leaves 2 v 2.
    const g = sim(5, { mafiaCount: 2, doctor: false }, 31);
    g.ackAll();
    killNight(g, g.town()[0]!);
    g.fire();
    expect(g.s.result).toEqual({ winner: "mafia", reason: "mafia_parity" });
    const outcome = M.calculateResults(g.s);
    for (const m of g.with("mafia")) {
      expect(outcome.awards).toContainEqual({ playerId: m, points: MAFIA_SCORING.mafiaWin, reason: "Mafia win" });
      expect(outcome.awards).toContainEqual({ playerId: m, points: MAFIA_SCORING.survived, reason: "Survived" });
    }
  });

  test("Doctor and Investigator earn points for good nights", () => {
    const g = sim(6, {}, 32);
    g.ackAll();
    const doc = g.one("doctor");
    const inv = g.one("investigator");
    const m = g.one("mafia");
    const victim = g.one("villager");
    g.night({ [m]: victim, [doc]: victim, [inv]: m });
    g.toVoting();
    g.voteAll((v) => (v === m ? victim : m));
    g.fire();
    const awards = M.calculateResults(g.s).awards;
    expect(awards).toContainEqual({ playerId: doc, points: MAFIA_SCORING.doctorSave, reason: "Saved a life" });
    expect(awards).toContainEqual({ playerId: inv, points: MAFIA_SCORING.foundMafia, reason: "Found the Mafia" });
  });

  test("the match always ends: a stalled town loses after the day limit", () => {
    const g = sim(6, {}, 33);
    g.ackAll();
    for (let day = 1; g.s.phase !== "results"; day++) {
      expect(day).toBeLessThanOrEqual(MAX_DAYS);
      g.fire(); // night: nobody picks
      g.fire(); // morning
      g.fire(); // discussion
      g.fire(); // voting: nobody votes
      g.fire(); // vote result
    }
    expect(g.s.result).toEqual({ winner: "mafia", reason: "day_limit" });
    expect(g.s.day).toBe(MAX_DAYS);
  });
});

describe("chat", () => {
  test("channels follow phase, role and life", () => {
    const g = sim(7, {}, 40);
    const [m1] = g.with("mafia");
    const vill = g.one("villager");
    // Reveal and night: Mafia whisper, town is silent.
    expect(g.act(vill, { type: "chat.send", text: "hello?" })?.code).toBe("WRONG_PHASE");
    g.mustAct(m1!, { type: "chat.send", text: "who first" });
    expect(g.s.chat.mafia).toHaveLength(1);
    g.ackAll();
    g.mustAct(m1!, { type: "chat.send", text: "the quiet one" });
    expect(g.view(vill).pub.chat).toEqual([]);
    expect(g.view(m1!).priv!.mafiaChat!.map((c) => c.text)).toEqual(["who first", "the quiet one"]);

    killNight(g, vill);
    // Day: the living talk in the town square; the dead talk among themselves.
    const living = g.alive()[0]!;
    g.mustAct(living, { type: "chat.send", text: "  it was   them  " });
    expect(g.view("x").pub.chat.map((c) => c.text)).toEqual(["it was them"]);
    g.mustAct(vill, { type: "chat.send", text: "boo" });
    expect(g.s.chat.graveyard.map((c) => c.text)).toEqual(["boo"]);
    expect(g.view(living).priv!.graveyardChat).toBeNull();
    expect(JSON.stringify(g.view(living))).not.toContain("boo");
    expect(g.view(vill).priv!.graveyardChat!.map((c) => c.text)).toEqual(["boo"]);
    expect(g.view(vill).priv!.chatChannel).toBe("graveyard");
  });

  test("validates length and keeps a bounded history", () => {
    const g = sim(5, {}, 41);
    g.ackAll();
    killNight(g, g.one("villager"));
    const id = g.alive()[0]!;
    expect(g.act(id, { type: "chat.send", text: "   " })?.code).toBe("INVALID_ACTION");
    expect(g.act(id, { type: "chat.send", text: "x".repeat(201) })?.code).toBe("INVALID_ACTION");
    for (let i = 0; i < CHAT_HISTORY_LIMIT + 5; i++) g.mustAct(id, { type: "chat.send", text: `m${i}` });
    const chat = g.view("x").pub.chat;
    expect(chat).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(chat.at(-1)!.text).toBe(`m${CHAT_HISTORY_LIMIT + 4}`);
  });
});

describe("presence", () => {
  test("the last Mafia leaving aborts the match", () => {
    const g = sim(5, {}, 50);
    g.ackAll();
    g.presence(g.one("mafia"), "left");
    expect(g.effects).toContain("abort");
  });

  test("a leaver is out without revealing their role, and their picks and votes are dropped", () => {
    const g = sim(7, {}, 51);
    g.ackAll();
    killNight(g, g.one("villager"));
    g.toVoting();
    const [a, b] = g.town().filter((id) => g.s.alive[id]);
    g.mustAct(a!, { type: "vote.cast", targetId: b! });
    g.presence(b!, "left");
    expect(g.s.voting!.ballots).toEqual({});
    expect(g.s.voting!.candidates).not.toContain(b);
    expect(g.view("x").pub.participants.find((p) => p.id === b)).toEqual({ id: b!, alive: false, role: null });
  });

  test("leaving can hand the Mafia parity", () => {
    const g = sim(5, { mafiaCount: 2, doctor: false }, 52);
    g.ackAll();
    g.presence(g.town()[0]!, "left");
    expect(g.s.result).toEqual({ winner: "mafia", reason: "mafia_parity" });
  });

  test("an away player doesn't block the night", () => {
    const g = sim(5, {}, 53);
    g.ackAll();
    const away = g.one("villager");
    g.presence(away, "away");
    for (const id of g.alive().filter((x) => x !== away)) {
      g.mustAct(id, { type: "night.pick", targetId: g.view(id).priv!.prompt!.options[0]! });
    }
    expect(g.s.phase).toBe("morning");
  });
});
