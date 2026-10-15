# Echo Beat: design notes

## The game

A rhythm puzzle on a hex grid. Everything moves on the beat of the soundtrack, Crypt of the NecroDancer style, but you never have to hit a timing window: **swipe anywhere and you step one hex that way on the next beat**. A swipe made just after a beat (within 0.13 s) still counts for that beat. Not swiping means you wait.

Grab every note, then reach the exit. The catch: each note turns the route you walked since the previous note into an **echo**, a pink copy of you that replays that route on the beat, there and back, forever. Share a hex with an echo or swap places with one and the take is ruined. So every level is partly built by you: a lazy route comes back as a big sweeping hazard, a tight one as a small predictable one.

**One-line pitch:** *Move on the beat. Every route you walk comes back to haunt you.*

## Structure: a record with three sides

24 tracks, unlocked in order. Each side adds machinery and has its own groove.

| Side | Groove | New elements |
| --- | --- | --- |
| A: Echoes (A1–A8) | dub steppers, 92–108 bpm | swiping, notes and echoes, waiting, planning routes |
| B: Machinery (B1–B8) | four-on-the-floor, 100–116 bpm | plates and gates (an echo can hold the door), spikes on a 4-beat cycle, cracked floor |
| C: Noise (C1–C8) | broken beat, 104–120 bpm | metronomes that patrol a line, portals, erasers that delete your oldest echo |

Every level is checked by a solver (`npm run solve`), which finds the shortest route it can, sets par to that plus two beats, and stores the route as the level's hint. `npm test` replays every stored route and fails if one stops winning.

Stars: 3 at or under par, 2 within par + 50 %, otherwise 1.

## Tutorial

- **A1** has no hazards. An animated finger shows the swipe, and the tip line walks you through it: swipe up, swiping early is fine, the squares at the bottom keep time.
- **A2** stops the music the moment your first echo appears, points at it, explains it, then resumes with a four-beat count-in.
- Every new element gets an intro card with a little printed diagram before the first track that uses it (waiting, plates and gates, spikes, cracked floor, metronomes, portals, erasers).
- The step sequencer at the bottom shows the beat, fills up as the next beat approaches, and records your last eight moves.

## Music

Procedural, generated with Web Audio and scheduled on the audio clock, which is also the game clock. Each note you collect adds an instrument; when the exit opens, the full arrangement plays. Echo-y sounds go through a tape-delay bus. Dying stops the record (filter sweep plus a needle scratch). Settings has an audio-delay calibration (tap along to 16 clicks) for phones and Bluetooth headphones that play sound late.

## Look: a risograph print, on purpose

Generic AI-built apps share a recognisable look: Inter or Roboto, dark mode with cyan or purple-blue gradients and neon glow, glassy rounded cards with soft shadows, emoji icons, everything centred with uniform spacing, gradient text, bouncy easing. Echo Beat avoids all of it:

- Spot inks overprinted on warm paper with multiply blending, so blue on yellow really turns green and pink on blue turns violet.
- Halftone floors, hatched walls, paper grain over everything, and ink plates that slip out of register a little on every beat (and a lot when you die: "Misprint").
- Dela Gothic One for display type, Archivo with its width axis for text. Left-aligned, poster-like layouts with hard edges and an offset pink "print" shadow instead of soft drop shadows.
- Drawn icons, no emoji. Stamps for results. Bottom sheets with a perforated edge, like inserts in a record sleeve.
- Eight ink sets (the cosmetic you unlock) reprint the whole game, menus included. Two are dark-paper prints that use screen blending.

## Monetization

**Rewarded ads (always optional):**
- Rewind to your last note after a death (once per note checkpoint).
- Unlock a track's hint instead of paying 40 coins.
- Double the daily reward.
- 25 free coins, five times a day.
- Unlock the Newsprint ink with three ads.

**Interstitials:** only when you leave a results screen after clearing a track (never after a death, never mid-track), not in the first 6 clears, then at most every 3rd clear and 90 seconds apart. Removed by the Remove Ads purchase.

**In-app purchases (Google Play Billing):**

| Product id | Type | Price | What it does |
| --- | --- | --- | --- |
| `remove_ads` | non-consumable | €2.99 | Removes interstitials; reward ads stay optional |
| `premium_inks` | non-consumable | €1.99 | Night Print, Kraft and Gold Foil ink sets |
| `coins_500` | consumable | €0.99 | 500 coins |
| `coins_2000` | consumable | €2.99 | 2,000 coins |

**Coins:** 10 for a first clear plus 5 per new star (a perfect first clear pays 25), a 7-day daily streak (20 → 200), and the free-coin ads. Spent on hints (40) and inks (250, 400, 600).

## Ideas for later

- Side D as a free update (more content is the best retention lever for a level-based game).
- A daily remix: a generated level with a shared leaderboard on Google Play Games.
- A level editor with share codes.
