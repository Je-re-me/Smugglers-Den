# Smugglers Den: Game Rules

## Setup

- 4 players. Each round has 1 inspector and 3 smugglers.
- 3 rotations, so 12 rounds. Each player inspects 3 times.
- Everyone starts with 50 currency.
- A hidden pool of normal cards with values 2, 3, and 4, plus contraband cards with real values. Duplicates are allowed.
- Every card has two values. The **passed value** (right) is what the smuggler receives if the package goes through. The **caught value** (left, red circle) is the fine when the package is caught, paid by whichever player made the mistake. Normal cards have a caught value of 2. Each contraband card has a caught value above its passed value.

## Each Round

1. **Deal:** Each smuggler is dealt 8 cards: 4 random normal goods and 4 random contraband, drawn from the pool. Hands are private and redealt every round from the same pool.
2. **Pack:** Each smuggler chooses how many cards to bring, between 1 and 5, and locks that count. The package declares one good: tomato (2), coconut (2), fish (3), or cheese (4). Normal cards in the package must match the declared good. Contraband is shown as the declared good. The card count and declared good are visible to all players. The cards themselves stay hidden.
3. **Bribe:** Each smuggler sets a bribe for the inspector, visible to the inspector. The bribe can be 0. It can't exceed the package's total declared value (declared value times the number of cards).
4. **Inspector's first choice, per package:**
   - **Pass:** The package goes through unchecked. The inspector receives the bribe. The game pays the smuggler the real value of every card in the package, contraband included. No one else pays.
   - **Inspect (bet):** The inspector bets the package contains contraband without looking yet. The bet is a pause only. It has no payout, and it notifies the smuggler that the package is suspected. Go to step 5.
5. **Bribe revision (optional):** The smuggler may change the bribe once, up or down, or keep it as is. The revised bribe is subject to the same cap as in step 3.
6. **Inspector's final choice:**
   - **Pass:** The package goes through unchecked. The inspector receives the revised bribe, or the original if the smuggler didn't revise it. The game pays the smuggler the real value of every card, as in step 4.
   - **Look (finalize):** The inspector examines the package. The bribe is forfeited, so the smuggler keeps it. Go to step 7.
7. **Resolution after looking:**
   - **Inspector wins** if the package contains contraband, or if the normal cards don't match the declared value. The smuggler pays the inspector the caught value of all cards in the package.
   - **Smuggler wins** if the package has only normal cards and is declared correctly. The inspector pays the smuggler the caught value of those cards (2 each).

After all packages are resolved, the inspector role rotates.

## Disconnects

- If a player disconnects during a game, the game ends and all players return to the lobby.

## End of Game

- After 12 rounds, the player with the most currency wins. Negative balances are allowed.
- **For Ties:** It's a shared win.
- After the game ends, all players return to the lobby for a new game.
