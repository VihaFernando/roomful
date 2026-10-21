# Mafia: rules, tie-breaks and scoring

Implementation: `apps/server/src/games/mafia/` (rules) · `packages/shared/src/games/mafia/` (contracts) ·
`apps/web/src/features/games/mafia/` (UI).

## Setup
- 5–10 players. Recommended 7–10.
- **Mafia count.** *Auto* (default) deals 1 Mafia for 5–6 players and 2 for 7–10. The host can fix it at 1–3,
  as long as the Mafia start as a strict minority (5–6 players → up to 2, 7+ → up to 3).
- **Doctor** and **Investigator** are on by default; each can be switched off. Everyone else is a Villager.
- Roles and seat order are shuffled with crypto randomness. Mafia learn who their partners are.

## Phases
| Phase | What happens | Ends when |
|---|---|---|
| reveal | Each player sees their own role (and Mafia partners). | every online player taps *Got it*, or 45 s |
| night | **Every** living player picks someone: Mafia vote on a target, the Doctor protects, the Investigator checks, Villagers mark a suspect (it has no effect; it keeps every phone equally busy so nobody's role shows). Mafia can whisper in a private chat. | every online living player has picked, or the night timer (40 s default) |
| morning | Who was killed, or "everyone survived". The Investigator privately learns the checked player's team. The Doctor privately learns if their patient was attacked. | 8 s |
| discussion | Living players talk in the town chat (plus out loud, if together). | every online living player taps *Ready*, or the timer (2 min default) |
| voting | Secret vote for anyone alive but yourself. Change freely. Only *who has voted* is public. | every online living player has voted, or the timer (45 s default) |
| voteResult | Tallies, and the eliminated player's role if *Reveal roles* is on. | 6 s |
| results | Every role, a night-by-night replay, every ballot, points. | the host picks *Play again* or *Lobby* |

## Night resolution (all at once, when the night ends)
1. **Mafia target**: plurality of the living Mafia's picks. A split vote goes to a **random pick among the tied
   leaders**. If no Mafia picked, nobody is attacked. Mafia can't target each other.
2. **Doctor**: if the protected player is the target, nobody dies.
   - Self-protection: *Once per game* (default), *Never* or *Any night*.
   - The same player can't be protected two nights in a row unless the host allows it.
3. **Investigator**: learns "Mafia" or "not Mafia" for the checked player. A result is still delivered if the
   Investigator is killed the same night.
4. The public only ever sees *how many* players have made their night move, never who or what.

## Voting and ties
1. Plurality of cast votes. Abstentions don't count.
2. One player with the most votes is eliminated.
3. **Tie**: one revote, limited to the tied players. Everyone alive may vote, but not for themselves.
4. **Tied revote, or no votes at all**: nobody is eliminated. Night falls.
5. Array order never decides anything. Tallies are sorted by seat only for display.

## Victory (checked after every morning and every vote result)
- **Town wins** when no Mafia are alive.
- **Mafia win** when living Mafia ≥ everyone else alive.
- **Day limit**: if the town hasn't won by the end of day 10, the Mafia win (the match always ends).

## Eliminated players and chat
- Eliminated players become **ghosts**: they see the public game and the town chat, and can talk in a ghost chat
  that the living never receive (it is not even sent to them). They can't vote or pick at night.
- Chat is plain text, 1–200 characters, the last 80 messages per channel. Town chat is open to the living from
  morning to the end of the vote. Mafia chat is open to living Mafia during the reveal and at night. The *Mafia*
  tab is only shown while it's open, so it never sits on screen by day.
- With *Reveal roles* off, the eliminated player's role stays hidden until results. Players who **leave** the
  room are out, and their role is never revealed by leaving.

## Scoring (`scoring.ts`, applied to the shared party scoreboard)
| Event | Points |
|---|---|
| Town wins | +2 to every town member (alive or not) |
| Mafia win | +3 to every Mafia member |
| Alive at the end, on the winning side | +1 |
| Doctor protects the Mafia's target | +1 per save |
| Investigator finds a Mafia member | +1 per distinct Mafia found |
| Town member votes for a Mafia member in the vote that eliminates them | +1 |

## Leaving mid-match
- If the last Mafia member leaves, or fewer than 3 players remain, the match is aborted, nobody scores, and the
  room returns to the lobby.
- A leaver's night pick and votes are discarded, and so are picks and votes aimed at them. Leaving can hand the
  Mafia parity, which ends the match.
- Players who are only *away* (connection dropped) keep their seat. Timers keep running, so nobody stalls the
  game.

## Secret isolation (tested)
- Public view is built field by field. Roles appear only for eliminated players (if the setting is on) and in
  results.
- Each private view holds only the viewer's own role and role-specific data: partners and partner picks (Mafia),
  checks (Investigator), saves (Doctor), Mafia chat (Mafia), ghost chat (eliminated players).
- Night rejections use one message for every role. Night prompts have the same shape for every role, and the
  role-reveal card looks the same for every role.
- Tests scan every frame a town player receives over WebSockets for the Mafia's role, partner list and whispers.
