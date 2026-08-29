# Deduction Grid — Game Design & Monetization Spec

**Version:** 1.0 (draft)
**Date:** 2026-08-20
**Status:** Pre-development, single-player prototype exists

---

## 1. Concept Overview

Deduction Grid is a number-based deduction puzzle in the spirit of Sudoku and Wordle. The game hides an N×N grid filled with digits drawn from a pool larger than N, arranged so no row or column repeats a digit. Players don't see the grid directly — they guess one full row at a time and receive Mastermind/Wordle-style per-digit feedback (green = correct digit and position, yellow = correct digit, wrong position, gray = not in that row). All guesses across every row draw from a single shared budget in single-player mode, rewarding players who use column overlaps between rows to deduce faster rather than guessing row by row in isolation.

The game ships with two modes:

- **Single Player** — solo against a shared guess budget, ad-supported with a rewarded "extra guesses" hook.
- **Multiplayer** — private lobbies where friends race to solve the same grid first.

---

## 2. Core Mechanics (already implemented in prototype)

| Element | Behavior |
|---|---|
| Grid generation | Randomized backtracking fill; digits per row/column never repeat. Pool size is always larger than grid size so generation never dead-ends. |
| Feedback | Two-pass Mastermind algorithm: exact matches marked green first, then remaining digits checked for presence elsewhere in the row (yellow), rest gray. |
| Row solving | A row is solved when all N digits return green. |
| Interface | Full grid shown at all times; clicking a row selects it and shows that row's guess history and input below the grid; solved rows are highlighted green, and (on loss) unsolved rows reveal the answer in red. |

This logic is mode-agnostic — both single-player and multiplayer reuse the same `generateGrid()` and `computeFeedback()` functions. Multiplayer's only functional difference is *how guesses are budgeted and how player states are synced*, not the underlying puzzle logic.

---

## 3. Single Player Mode

### 3.1 Difficulty tiers (current values)

| Difficulty | Grid size | Digit pool | Guess budget |
|---|---|---|---|
| Easy | 4×4 | 1–6 | 12 |
| Medium | 5×5 | 1–8 | 18 |
| Hard | 6×6 | 1–9 | 25 |

These are tunable and should be treated as **remote-config values**, not hardcoded constants, so they can be rebalanced post-launch based on completion-rate data without an app update.

### 3.2 Ad placement

- **Interstitial:** triggers on completing row 3 or row 4 of a game, but capped to roughly **1 in every 2–3 games** (not every game). Frequency capping should be server-controlled (remote config or a lightweight backend flag) so it can be tuned without a release. Never fires mid-input (i.e., not while the player has partially typed a guess) to avoid interrupting a solve in progress.
- **Rewarded video:** offered when the player exhausts their guess budget without solving the grid. Watching grants **+2 guesses** to the shared budget, one offer per game (configurable — consider allowing a second rewarded ad at a steeper "diminishing returns" point, e.g. +1 guess, if data shows demand).
- **Ad SDK:** AdMob (or a mediation layer like AppLovin MAX) recommended for both interstitial and rewarded formats, with mediation preferred once traffic justifies it (better fill rate and eCPM than a single network).

### 3.3 End-of-game stats screen

Required fields:

- Result (solved / not solved), total guesses used vs. budget
- Completion time
- Win percentage (lifetime)
- **Current streak / best streak** — highest-priority addition beyond the original ask; this is the primary daily-return driver in this genre (see Wordle, NYT Games) and should not be deprioritized.
- Per-row guess count breakdown (nice-to-have, supports the "efficiency" fantasy of the genre)

Stats persist locally (device storage) at minimum; syncing to an account/cloud store is a v2 consideration once accounts exist (needed anyway for multiplayer identity).

---

## 4. Multiplayer Mode (v1 scope: private lobbies only)

### 4.1 Lobby flow

1. Host taps "Create Lobby," picks a difficulty, and receives a shareable code/link.
2. Invited players join via code/link/deep link. No public browse/matchmaking in v1 — this avoids needing lobby-name or player-name content moderation for launch (public lobbies are a deliberate v2+ item, see Section 7).
3. Once all invitees are in, the host starts the match. A single grid is generated server-side (or with a shared seed) so every player is racing against the identical puzzle.

### 4.2 Match rules

- **Guesses:** not truly infinite — a **short cooldown** (initial value: ~3 seconds between submitted guesses per player, tunable) applies so the race rewards deduction quality over raw input speed, while still allowing far more attempts than the single-player budget.
- **No ad-based or paid guess boosts during a match.** Any pay-for-advantage mechanic in a head-to-head race against real players is a pay-to-win pattern and should be avoided entirely — this applies even to the rewarded-ad mechanic used in single-player.
- **Win condition:** first player to fully solve the grid (all rows green) triggers a **grace period** (initial value: 30–60 seconds, tunable) during which remaining players can keep guessing to lock in 2nd/3rd/etc. place. When the grace period expires (or all players finish early), the match ends for the whole lobby simultaneously.
- **Live state:** each player's screen should show opponents' row-completion progress (e.g., "3/5 rows solved") without revealing their actual guesses — enough to create race tension without giving away deduction help.

### 4.3 End of match

- All players land on a shared results screen (final placements, time, guesses used per player) at the same moment.
- **Interstitial ad fires here for every player** — this is a natural break point between matches and the agreed placement for multiplayer monetization.

---

## 5. Monetization Summary

| Mechanic | Mode | Type | Notes |
|---|---|---|---|
| Interstitial (mid-game, capped frequency) | Single-player | Ad | Fires between rows, ~1 in 2–3 games |
| Rewarded video (+2 guesses) | Single-player | Ad | Opt-in, one per game |
| Interstitial (post-match) | Multiplayer | Ad | Fires for all players simultaneously at results screen |
| Remove Ads | Both | IAP (one-time) | Removes all interstitials; rewarded-ad opt-in likely kept even for purchasers, since it's player-initiated value rather than an interruption |
| Puzzle archive / extended stats | Single-player (future) | Subscription | Deferred to v2+ pending retention data; mirrors NYT Games model |

**Sequencing recommendation:** launch with ads + Remove Ads IAP only. Hold subscription/archive until you have real daily-active and retention numbers to justify building it — the marginal cost of a subscriber is near-zero once the archive exists, but building it before validating demand is wasted effort.

**Platform note:** both single-player and multiplayer IAP (Remove Ads, any future subscription) must go through Apple's StoreKit and Google Play Billing respectively — neither platform allows routing digital-good purchases through an external payment system.

---

## 6. Technical Architecture

### 6.1 Client

- Current prototype: single self-contained HTML/CSS/JS file, no build step, no dependencies.
- Recommended path to mobile: **Capacitor** wraps the existing web code into native iOS/Android shells with access to native plugins (haptics, push notifications, IAP, ad SDKs) without a framework rewrite.
- Needed before wrapping: split the single-file prototype into a proper web project structure, add local persistence (stats, streaks, settings — currently the prototype resets on refresh), add sound/haptics hooks.

### 6.2 Single-player backend

None required. Fully client-side; remote config (e.g., Firebase Remote Config) recommended for tuning difficulty values and ad frequency without app releases.

### 6.3 Multiplayer backend

Requires a real-time layer not present in the current prototype:

- **Lobby state & presence:** create/join lobby, track connected players, handle disconnect/reconnect.
- **Grid sync:** generate one grid per match (server-authoritative, or a shared seed sent to all clients) so every player sees the same puzzle without the answer being derivable from client code alone.
- **Live progress sync:** broadcast each player's row-completion state to the lobby in near real-time.
- **Recommended stack:** Firebase Realtime Database/Firestore or Supabase Realtime for lowest implementation effort at this scale; a dedicated service (e.g., Colyseus) is worth considering only if multiplayer traffic grows large enough to need more control over server-authoritative match logic.

### 6.4 Data model (minimum viable)

- `Player`: id, display name, stats (games played, win %, streak, best streak)
- `SinglePlayerRun`: player id, difficulty, grid seed, guess history per row, result, duration
- `Lobby`: id, host id, difficulty, grid seed, state (waiting/active/grace-period/ended), player list
- `MultiplayerRun`: lobby id, player id, guess history, solve time, placement

---

## 7. Roadmap / Phasing

**Phase 1 — Single Player Launch**
Convert prototype to Capacitor app, add persistence/streaks/stats screen, integrate ad SDK (interstitial + rewarded), add Remove Ads IAP, submit to both stores.

**Phase 2 — Multiplayer (Private Lobbies)**
Add backend for lobby/grid/progress sync, implement cooldown + grace-period race rules, shared post-match ad trigger.

**Phase 3 — Growth Features (data-dependent)**
Evaluate based on Phase 1–2 retention: puzzle archive + subscription, public lobbies with matchmaking (requires content moderation on lobby/player names per App Store/Play policy — Apple Guideline 1.2 on UGC in particular), cosmetic IAP (grid themes).

---

## 8. Open Questions / Risks

- **Ad frequency tuning:** "1 in 2–3 games" is a starting hypothesis, not a validated number — needs A/B testing once live.
- **Guess cooldown value (multiplayer):** 3 seconds is a placeholder; needs playtesting to find the point where it curbs brute-forcing without feeling punitive.
- **Grace period length:** 30–60 seconds is a placeholder; depends on observed solve-time spread once real players are racing.
- **Privacy policy & tracking consent:** required by both app stores before submission, especially once ad SDKs and analytics are integrated (App Tracking Transparency on iOS). Recommend legal review rather than relying on general guidance here.
- **Public lobbies (Phase 3):** will require a moderation plan (name filtering, block/report) before submission — deliberately deferred out of v1 scope to keep initial launch simple.
