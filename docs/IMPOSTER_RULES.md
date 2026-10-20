# Imposter: rules, tie-breaks and scoring

Implementation: `apps/server/src/games/imposter/` (rules) · `packages/shared/src/games/imposter/` (contracts).

## Setup
- 3–10 players. 1–3 Imposters, limited by player count: at least 2 crew, and fewer Imposters than crew
  (3–4 players → 1, 5–6 → up to 2, 7+ → up to 3).
- 2 or more Imposters require **elimination** mode.
- The server picks a word uniformly from the enabled categories, skipping the room's last 30 words where
  possible. Roles and seat order are shuffled with crypto randomness.

## Phases
| Phase | What happens | Ends when |
|---|---|---|
| reveal | Crew see the word and category. Imposters see their role, the category (if *Show the category* is on) and any fellow Imposters. | every online player taps *Got it*, or 60 s |
| clues | Turn order is the seat order rotated to a random start each cycle. One clue per turn, 1–40 characters. | each player clues (×rounds); 30 s per turn by default |
| discussion | All clues shown, grouped by player. | every online active player is ready, or the timer ends |
| voting | Vote for anyone but yourself. Change freely. Only *who has voted* is public. | every online active player has voted, or the timer ends |
| voteResult | Tallies, plus the role of anyone voted out. | 6 s |
| guess | (optional) A surviving Imposter gets one guess at the word. | everyone has guessed, or 30 s, then 5 s to show the result |
| results | Word, every role, all clues, every ballot, points. | the host picks *Play again* or *Lobby* |

Details:
- **Timeouts.** A clue turn that times out is recorded as "ran out of time" and play moves on. A player who
  disconnects during their turn keeps the full timer. A player who has *left* is skipped immediately.
- **Clues that give the word away.** Crew clues containing the word (whole word, simple plurals, or the
  squashed form of a multi-word answer) are rejected. Imposters are never checked: a rejection would tell them
  the word.
- **The host has no special powers in a match.** They can't skip phases or see roles. They can only end the
  match (no scores) or restart it after results.

## Voting and ties
1. Plurality of the votes cast decides. Abstentions don't count.
2. One player with the most votes is voted out.
3. **Tie** (including nobody voting): one revote, limited to the tied players. Everyone may vote, but not for
   themselves.
4. **Tied revote: inconclusive.** Nobody is voted out.
5. Array order never decides anything. Tallies are sorted by seat only for display.

## Victory
**oneVote (default, 1 Imposter):**
- Imposter voted out → **crew wins**.
- Crew member voted out, or inconclusive → **Imposter wins**. If *Imposter's last guess* is on, the Imposter
  then guesses the word. A correct guess earns bonus points but doesn't change the result.

**elimination (required with 2+ Imposters):**
- After each vote: if no Imposters remain → crew wins.
- If the vote missed and guessing is on: each surviving Imposter who hasn't guessed yet may take **one guess per
  match** (or pass to save it). A correct guess means the **Imposters win** right away. The public screen shows
  only "x of y guessed" and a wrong/right result, never who guessed, so surviving Imposters stay hidden.
- Imposters ≥ crew remaining → Imposters win (parity).
- After 4 cycles → Imposters win.
- Otherwise a new cycle starts with the same word. Voted-out players watch.

## Scoring (`scoring.ts`, applied to the shared party scoreboard)
| Event | Points |
|---|---|
| Crew team wins | +2 to every crew member (including those voted out) |
| Voted for an Imposter in a vote that eliminated them (crew only) | +1 per such vote |
| Imposter team wins | +3 to every Imposter |
| Imposter guesses the word | +2 |

## Leaving mid-match
- If no Imposter remains, no crew remains, or fewer than 3 active players remain, the match is aborted, nobody
  scores, and the room returns to the lobby.
- If a candidate leaves during voting, their ballots and any votes against them are discarded. A revote left
  with fewer than 2 candidates closes immediately.
