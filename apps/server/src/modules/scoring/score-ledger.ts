import type { ScoreAward, ScoreboardEntry } from "@party/shared";

/**
 * Party scoreboard for one room, shared by every game. Games never touch it
 * directly: they return ScoreAwards and the platform applies them here.
 */
export class ScoreLedger {
  private entries = new Map<string, ScoreboardEntry>();

  ensure(player: { id: string; nickname: string; avatarId: string }) {
    const e = this.entries.get(player.id);
    if (e) {
      e.nickname = player.nickname;
      e.avatarId = player.avatarId;
      e.present = true;
    } else {
      this.entries.set(player.id, {
        playerId: player.id,
        nickname: player.nickname,
        avatarId: player.avatarId,
        points: 0,
        wins: 0,
        gamesPlayed: 0,
        present: true,
      });
    }
  }

  /** Applies one finished match. Awards for unknown players are ignored. */
  applyMatch(participantIds: readonly string[], winnerIds: readonly string[], awards: readonly ScoreAward[]) {
    for (const id of participantIds) {
      const e = this.entries.get(id);
      if (e) e.gamesPlayed += 1;
    }
    for (const id of new Set(winnerIds)) {
      const e = this.entries.get(id);
      if (e) e.wins += 1;
    }
    for (const a of awards) {
      const e = this.entries.get(a.playerId);
      if (e && Number.isFinite(a.points)) e.points += Math.trunc(a.points);
    }
  }

  markLeft(playerId: string) {
    const e = this.entries.get(playerId);
    if (!e) return;
    // Players who never scored disappear entirely; others stay greyed out.
    if (e.gamesPlayed === 0) this.entries.delete(playerId);
    else e.present = false;
  }

  /** Sorted standings: points, then wins, then name for stable display. */
  standings(): ScoreboardEntry[] {
    return [...this.entries.values()]
      .map((e) => ({ ...e }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.nickname.localeCompare(b.nickname));
  }
}
