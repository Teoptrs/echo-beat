# Echo Beat: design notes

## The game

A rhythm puzzle on a hex grid. Everything moves on the beat of the soundtrack, Crypt of the NecroDancer style, but you never have to hit a timing window: **swipe anywhere and you step one hex that way on the next beat**. A swipe made just after a beat (within 0.13 s) still counts for that beat. Not swiping means you wait.

Grab every note, then reach the exit. The catch: each note turns the route you walked since the previous note into an **echo**, a pink copy of you that replays that route on the beat, there and back, forever. Share a hex with an echo or swap places with one and the take is ruined. So every level is partly built by you: a lazy route comes back as a big sweeping hazard, a tight one as a small predictable one.

**One-line pitch:** *Move on the beat. Every route you walk comes back to haunt you.*

## Structure: a record with five sides

52 tracks, unlocked in order. Each side adds machinery and has its own groove.

| Side | Groove | New elements |
| --- | --- | --- |
| A: Echoes (12 tracks) | dub steppers, 92–108 bpm | swiping, notes and echoes, waiting, planning routes |
| B: Machinery (12) | four-on-the-floor, 100–116 bpm | plates and gates (an echo can hold the door), spikes on a 4-beat cycle, cracked floor |
| C: Noise (12) | broken beat, 104–120 bpm | metronomes that patrol a line, portals, erasers that delete your oldest echo |
| D: Shadows (8) | half-time, sub bass, 100–116 bpm | your shadow: every second beat it steps toward you, but only if that gets it closer, so walls hold it. It falls to echoes, metronomes, raised spikes and crumbling floor, and it can hold a plate down |
| E: Locks (8) | woodblock and tumbler clicks, 108–124 bpm | keys and doors: a key opens every door of its shape for good; doors also stop shadows and metronomes |

Level ids never change, because saved progress is keyed by them. A level added later takes the next free id on its side (A9, A10, ...) and is slotted in where it fits; the game shows each level's place on its side instead (`LABEL` in levels.js).

### Level design rules

Open fields let you walk around your echoes, so they stop mattering. `node tools/inspect.mjs <id>` reports, next to par, the shortest win with echoes made harmless ("free"); when it equals par, the echoes never forced a detour or a wait. 21 of the first 24 levels were like that, so the 12 levels added to sides A to C use 1-wide passages, dead ends and mazes where you must walk back along your own route: a note at the end of a corridor (wait at the start so your echo starts late), a plate your echo keeps pressing because you waited on it, an echo that walls off the way until an eraser removes it, note orders where the wrong order costs ten beats. For shadow levels it also reports how many beats the shadow costs ("noShadow"), and which events the route depends on (the shadow falling to your echo, a metronome or a crack; keys).

Design maps as pictures with `tools/hexpic.mjs`: in a picture every hex sits next to its real neighbours, which avoids the classic mistake of offset rows (a map row is a zigzag, not a straight line).

Every level is checked by a solver (`npm run solve`), which finds the shortest route it can, sets par to that plus two beats, and stores the route as the level's hint. `npm test` replays every stored route and fails if one stops winning. In play, stepping off the hint route (or missing a beat) holds the board still while the same solver plots a new route from where you are, then a count-in starts it.

Stars: 3 at or under par, 2 within par + 50 %, otherwise 1.

## Tutorial

- **A1** has no hazards. An animated finger shows the swipe, and the tip line walks you through it: swipe up, swiping early is fine, the squares at the bottom keep time.
- **A2** stops the music the moment your first echo appears, points at it, explains it, then resumes with a four-beat count-in.
- Every new element gets an intro card with a little printed diagram before the first track that uses it (waiting, plates and gates, spikes, cracked floor, metronomes, portals, erasers, your shadow, keys and doors).
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
- An extra hint. One hint is free every hour; any more cost an ad.
- Double the daily reward.
- 25 free coins, five times a day.
- Unlock the Newsprint ink with three ads.
- **Slow tempo power-up:** from the pause menu or the death screen, play the track at 75% of its tempo until you leave it. Ads are the only way to get it; it can't be bought with coins or money. Stars still count beats, so a slow clear can still earn three.

**Interstitials:** only when you leave a results screen after clearing a track (never after a death, never mid-track). Side A is ad-free. From side B on, one plays after every 2 or 3 clears (picked at random each time), never twice within 45 seconds. Removed by the Remove Ads purchase.

**In-app purchases (Google Play Billing):**

| Product id | Type | Price | What it does |
| --- | --- | --- | --- |
| `remove_ads` | non-consumable | €2.99 | Removes interstitials; reward ads stay optional |
| `premium_inks` | non-consumable | €1.99 | Night Print, Kraft and Gold Foil ink sets |
| `coins_500` | consumable | €0.99 | 500 coins |
| `coins_2000` | consumable | €2.99 | 2,000 coins |

**Coins:** 10 for a first clear plus 5 per new star (a perfect first clear pays 25), a 7-day daily streak (20 → 200), and the free-coin ads. Spent on inks (250, 400, 600).

## Ideas for later

- More sides as free updates (more content is the best retention lever for a level-based game).
- A daily remix: a generated level with a shared leaderboard on Google Play Games.
- A level editor with share codes. A level is small (a 7×9 map plus a few metronomes), so it fits in a short text code that players paste to each other; that needs no server. A server only becomes necessary for browsing, rating or featuring other players' levels.
- New elements: one-way tiles, conveyors that push everyone a step on the beat, ice you slide across until something stops you, tempo changes mid-track, a mirror echo that walks your route reflected, fuse tiles that blow up a few beats after you leave them, a pickup that freezes your echoes for a bar.
