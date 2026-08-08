# shared-development-boardgame

Hex Cube Cities is a local hot-seat board game prototype for 2-4 human players.
Players draft cards, use each card as one turn, place shared cubes into hex
areas, build owned cities on shared intersections, and let those cities produce
next round's cubes from adjacent area colors.

## Requirements

- Node.js 22.x
- pnpm 9.x

This repository is a pnpm workspace:

```text
apps/
  web/          React + TypeScript + Vite
  server/       Fastify + TypeScript
packages/
  game-core/    UI/HTTP-independent game state and rules
  protocol/     shared Web/Server public types
```

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

The command starts both services:

- Web UI: http://127.0.0.1:5173
- Server API: http://127.0.0.1:3000

The Vite dev server proxies `/api/*` requests to the Fastify server.
If either port is already in use, run with explicit alternatives:

```bash
SERVER_PORT=3001 WEB_PORT=5174 pnpm dev
```

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
```

## Current Rules

- 2-4 human players use one desktop browser in hot-seat style.
- Player 1 always starts. Player colors are fixed and assigned automatically.
- The board is fixed to seven regular hex areas: one center area and six
  surrounding areas.
- Hex centers hold shared cubes. Hex vertices are shared intersections for
  cities.
- Shared intersections are deduplicated; a shared vertex is one build location
  with one stable intersection ID and 1-3 adjacent area IDs.
- A shared intersection can hold a city stack of up to three city pieces.
- Cubes have three colors: red, blue, and yellow.
- Cubes have no owner on the board. They are owned only while in a player's hand.
- The common cube supply is treated as effectively unlimited for playtesting.
- One card use is one action turn. Pass and independent cube-taking actions are
  not part of the current rule set.
- City building is not a card action. During the current player's action turn,
  they may build any number of cities as long as they can pay the cost.
- Each action turn must use exactly one card before it can end. City builds may
  happen before or after that card use. Ending the turn advances to the next
  player with cards.
- After the card use, the current player may place exactly one hand cube into
  one area while ending the turn, or skip placement.
- Valid city builds do not advance the turn. Invalid actions do not change state
  or advance the turn.
- The server is the source of truth for game state and rule validation.

## Area Color

Area color uses the tied-majority-loses rule:

- A single highest color wins.
- If two colors tie for highest, those colors are ignored and the remaining
  color wins if it has at least one cube.
- If all three colors tie, or no remaining color has cubes, the area is neutral.

Area color is recalculated immediately whenever board cubes change.

## Area Level

Area level is derived from the total number of cubes in that area and is
independent from area color.

| Area cubes | Area level |
| ---: | ---: |
| 0 | 0 |
| 1-2 | 1 |
| 3-4 | 2 |
| 5-6 | 3 |

Neutral areas still have area level and still count toward world level. They do
not produce cubes from cities and are not scored by red, blue, or yellow
production cards.

## World Level

World level is derived from the total number of shared cubes on the board.

| World level | Board cubes | Area capacity | Maximum buildable city level |
| --- | ---: | ---: | ---: |
| 1 | 0-13 | 2 | 1 |
| 2 | 14-27 | 4 | 2 |
| 3 | 28+ | 6 | 3 |

Area capacity is the total number of cubes in an area, not a per-color limit.
Raising world level does not upgrade existing cities. It only unlocks higher
city stack levels and larger area capacity.

## Round Structure

The game lasts three rounds.

1. City production
2. Draft
3. Action phase
4. When every hand is empty and the active turn ends, start the next round or
   end the game

At the start of each round, before draft, every city produces cubes
simultaneously. Each city piece in a stack is handled independently:

```text
production per colored connection = city level * area level
```

Neutral adjacent areas produce nothing even when they have area level. Multiple
matching adjacent areas, multiple cities, and multiple city pieces in the same
stack are all summed.

## Draft

Each round deals 8 cards per player. Players pick one card from their current
pack, then remaining cards rotate to the next player. Draft continues until each
player has 8 cards. Cards are public in this prototype.

## Card Uses

Every action turn must consume exactly one hand card. Each card can be used in
one of three ways:

- Use the card's production action.
- Use the card's scoring action to gain immediate contribution.
- Ignore the printed card effect and take one cube of any color.

Initial card types:

- Red production: immediately gain 1 red cube. When turn-end placement or skip
  resolves, gain 1 red cube for each red area after that placement decision.
  Scoring still counts every connection between your city pieces and red areas
  as `city level * area level`.
- Blue production: immediately gain 1 blue cube. When turn-end placement or skip
  resolves, gain 1 blue cube for each blue area after that placement decision.
  Scoring still counts every connection between your city pieces and blue areas
  as `city level * area level`.
- Yellow production: immediately gain 1 yellow cube. When turn-end placement or
  skip resolves, gain 1 yellow cube for each yellow area after that placement
  decision. Scoring still counts every connection between your city pieces and
  yellow areas as `city level * area level`.

A city touching multiple areas of the target color scores each connection.
Neutral areas are not scored by these cards.

## Turn-End Placement

After the required card use and any city builds, the player ends the turn by
choosing one of:

- place one hand cube of any color into one area
- skip placement

Turn-end placement is optional, but the turn does not advance until one of those
choices resolves. Placement cannot exceed the area capacity after the placement
is applied. The placed cube becomes shared, and area color, area level, board
cube total, world level, and area capacity are recalculated from the new board
state.

If the used card is a red, blue, or yellow production card, its additional
production is resolved only after this placement decision. Skipping placement
uses the current area colors.

## Cities

Build a city on any intersection by paying matching red, blue, and yellow cubes
from the current player's hand. The city level is the next stack level at that
intersection:

- Lv1 city: red 1, blue 1, yellow 1
- Lv2 city: red 2, blue 2, yellow 2
- Lv3 city: red 3, blue 3, yellow 3

You may build on your own city or another player's city. You may only build the
next stack level, cannot skip levels, and cannot build above the current world
level's maximum city level. Lower city pieces keep their owner and level when a
new city is stacked above them. Paid cubes return to the unlimited common supply
and do not affect board cube totals.

Each owned city piece is worth 1 contribution at game end. City level itself is
not extra final contribution.

## End Game

The game ends after round 3 when every player's hand is empty. Final contribution
is card-scoring contribution plus owned city count. The player or players with
the highest final contribution win; tied winners are shared.

## Controls

- Start a new game from the setup screen with 2-4 display names.
- During draft, click a card from the current pack.
- During action phase, choose a hand card and one of its three uses.
- Use the city build panel before or after card use while the current player can
  pay the next stack level's city cost.
- After card use, choose a color and area to place one cube, or click the skip
  placement button to end the turn.
- Undo restores the full state before the most recent successful action.
- Reset restarts the current player set from the initial state.
- Recent action history, city production, final results, and server-side errors
  are shown beside the board.

## API

The server exposes:

```text
GET  /api/game
POST /api/game/start
POST /api/game/actions
POST /api/game/undo
POST /api/game/reset
```

The web app calls the server API only. It does not import `game-core` directly.

## Intentionally Not Implemented

- roads
- city distance or adjacency restrictions
- facility cards, technologies, area powers, random events, or hidden information
- AI players
- online multiplayer, WebSocket synchronization, authentication, persistence,
  database storage, matchmaking, or multiple simultaneous games
- board expansion
- high-quality art assets
