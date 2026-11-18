# Epidemic Dots

*One board a day. Three dots. One of your neighbours is secretly sick. Choose your friends wisely.*

A daily outbreak puzzle for Reddit, built with **Devvit Web** for Reddit's Game of the Day Hackathon 2026.
Every day the subreddit gets one new board. You plant three dots, release the germs, and watch eight rounds of
growth and contagion. The result is instant, and you can try again (three runs a day, your best counts).

## Overview

**Epidemic Dots** is a quick daily puzzle game that lives in a Reddit post. It is for anyone who likes a
two-minute daily game and for communities that want a shared daily ritual: one board a day for the whole subreddit,
a team goal everyone chips in on, and a vote on how the germs change tomorrow.

Critical notes: the game stores only what it needs to play (your three dots, your score, your vote), under your
Reddit user id, and deletes it automatically after 14 days. It never shows usernames. It never posts, comments or
subscribes as you. Posts and the pinned how-to comment come from the app account. There are no purchases, no outside
links, no external services and no free-text input.

## For moderators: set up and run

1. Install the app in your subreddit.
2. Installing the app posts today's game in the feed. After that the app posts a new board by itself every day at
   00:00 UTC. (The subreddit menu item **Create a new post** is only for an extra post, if you ever need one.)
3. Players tap the post to play. Nothing else needs configuring.

Questions, bug reports or anything that looks wrong: message the mods of r/epidemic_dots_dev (modmail). Posts and
comments can also be reported with Reddit's normal report button.

## How to play (about 20 seconds)

1. **Tap 3 squares** to plant your dots. The first tap zooms in on that area so your thumb can pick the exact square;
   the second tap plants the dot. Tap a dot of yours again to take it back.
2. **Press the pink button.** Your dots grow into **empty squares** next to them, one ring per round. A square that
   touches two different colonies stays empty.
3. **One colony is secretly sick** (Patient Zero). When the germs wake up they jump to nearby dots and kill what they
   infect two rounds later. A square that touches two colonies stays empty, so crowding a neighbour blocks you both, and
   germs hop between nearby dots. Keep as many of your dots alive as you can.

The lab predicts how many dots you will keep. Beat the prediction for a badge. After your first run the game tells you which colony was Patient Zero and how the germs reached you, so the next run can be smarter.

## Scoring

- **Immunity score** = your surviving dots as a percentage of the **lab's benchmark** on that board (the best
  placement the lab's search found for that day; you can beat it). For example, 24 of 36 is 67% immune.
- **Three runs a day, the best one counts** for your rank, the team goal and your weekly average. Runs are scored on
  the server, never trusted from the app.
- **Team goal:** if the real players' best runs average the day's goal (lab rats do not count), the next day is a **Vaccine day** and the germs wake
  up two rounds later.
- **Daily mutation:** after your run, vote for how the germs change tomorrow: **Zoomier** (spread every round, but
  only 1 square), **Jumpier** (one square further) or **Grumpier** (wake a round earlier). The most popular one wins; if nobody votes, the lab rats (bots) pick one, so most days have a twist.
- **Weekly leagues** (Sniffle, Cough, Fever, Outbreak, Pandemic) move you up on your weekly average. You never move down while you keep playing (after 14 days away the lab forgets you and you start again in Sniffle).
  Reach a 60% weekly average to move up one league per week. You can optionally show your league as your flair in the subreddit; it is off until you tap the button and you can remove it any time.
- **Every board is checked for fairness** before it goes live. The lab aims for a benchmark of at least 15 dots and
  no more than half of random first runs ending with nothing alive. If a layout or the lab rats' twist misses that,
  the twist is dropped (the game says so) or the layout redrawn; in the rare case that nothing passes, the fairest
  candidate is used. The lab's forecast is calibrated per board and is always below the benchmark.
- **Difficulty rotates by day:** easy days (Sneezy), spicy days (Hopper) and chaotic days (Yeet), each with its own
  board layout and its own team goal.

## Sound

Little sound effects, synthesized in the browser with Web Audio (no audio files): a plink for every dot you plant, a
soft tick each round, a comic *bwomp* when the germs wake up, a sad *boing* when they reach your dots, and a small
fanfare (or a deadpan *wah-wah* when the lab was right). Sounds only start after you tap, the feed card is always
silent, and the speaker button next to the date mutes them (remembered on your device).

## Lab rats (bots)

So a small or new subreddit still has a rank, a team average and a lively board, a few **lab rats** play every day.
They are bots and they are **always labelled as bots** ("lab rat #123 (bot)"). Real players are shown anonymously as
"lab rat #N" too, without the "(bot)" tag. The six neighbour colonies on the board are yesterday's real players' best placements (up to six, anonymous: stored by a numbered slot, never by username) and lab-rat bot colonies when there are not enough. Your own colony may come back as a neighbour, and the game tells you which one.

## Accessibility

- The board can be played with the keyboard: Tab to the board, arrow keys move, Enter plants or takes back a dot. A hidden live region reads out the square ("Column 3, row 5. Empty").
- Your own dots have a dashed outer ring, so colour is never the only way to tell them apart. Sick dots also have a different face.
- Text colours meet WCAG AA contrast (checked by a test), pinch-zoom is allowed, and focus is always visible.
- With "reduce motion" on, the zoom, pop-in and feed-card loop stay still.
- Sound is never needed to play: every sound has an on-screen message too, and the speaker button turns it off.

## Privacy

- Stored per player: today's best placement, score, vote, weekly average, league and whether you opted in to the league flair, keyed by Reddit user id, auto-deleted after 14 days.
- Yesterday's best placements are reused as neighbour colonies under a numbered slot only, never with a user id or username.
- Nothing is sent to outside services, and nothing is sold or used to profile anyone.

## Design rules we hold ourselves to

- No loot boxes, no random rewards, no paid randomness, no daily-login bonuses.
- No streaks and no daily-login pressure: nothing here punishes you for missing a day.
- The game never posts or comments as you. (A tap-to-confirm "share my score as a comment" is built but switched off until Reddit approves the app, because only approved apps can post as the player.)
- Funny, never mean to the player.

## Built with

Devvit Web (React 19, Hono, Redis), TypeScript, Vite, Tailwind CSS, the Caveat font (SIL OFL, bundled locally, used only for the title).
The game engine in `src/shared` is plain TypeScript shared by the client and the server and covered by tests
(unit, parity against the original prototype, balance and goal calibration).

## For developers

```bash
npm install
npm run test:unit      # engine, board, bots, scoring and calibration tests
npm run test:types     # type-check
npm run lint
npm run build
npx devvit login       # then: npx devvit upload && npx devvit install <your_test_subreddit>
```

- App name: `epidemic-dots` (the listing keeps this slug; the game is called **Epidemic Dots**).
- Layout: `src/shared` (engine, board, bots, leagues, scoring; plain TypeScript with tests), `src/server` (Hono routes,
  Redis, daily scheduler), `src/client` (React game and feed card). `prototype/` holds the original plain-JS engine
  and its balance test (`node prototype/balance-test.js`), which the parity test checks against.

## Status

Playable build in a test subreddit, including the daily mutation vote (Zoomier, Jumpier, Grumpier). Not built yet:
nothing planned beyond polish.
