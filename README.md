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

## World Level

World level is derived from the total number of shared cubes on the board.

| World level | Board cubes | Area capacity | City level |
| --- | ---: | ---: | ---: |
| 1 | 0-13 | 3 | 1 |
| 2 | 14-27 | 5 | 2 |
| 3 | 28+ | 7 | 3 |

Area capacity is the total number of cubes in an area, not a per-color limit.

## Round Structure

The game lasts three rounds.

1. City production
2. Draft
3. Action phase
4. When every hand is empty and the active turn ends, start the next round or
   end the game

At the start of each round, before draft, every city produces cubes
simultaneously:

```text
production = current city level * adjacent area count of that color
```

Neutral adjacent areas produce nothing. Multiple cities are summed.

## Draft

Each round deals 8 cards per player. Players pick one card from their current
pack, then remaining cards rotate to the next player. Draft continues until each
player has 8 cards. Cards are public in this prototype.

## Card Uses

Every action turn must consume exactly one hand card. Each card can be used in
one of three ways:

- Use the card's development or production action.
- Use the card's scoring action to gain immediate contribution.
- Ignore the printed card effect and take one cube of any color.

Initial card types:

- Red development: gain 2 red cubes; score your cities adjacent to at least one
  red area times current city level.
- Blue development: gain 2 blue cubes; score your cities adjacent to at least
  one blue area times current city level.
- Yellow development: gain 2 yellow cubes; score your cities adjacent to at
  least one yellow area times current city level.

A city counts once for a color-card score even when it touches multiple areas of
that color.

## Turn-End Placement

After the required card use and any city builds, the player ends the turn by
choosing one of:

- place one hand cube of any color into one area
- skip placement

Turn-end placement is optional, but the turn does not advance until one of those
choices resolves. Placement cannot exceed the current area capacity after the
placement is applied. The placed cube becomes shared, and area color, board cube
total, world level, area capacity, and city level are recalculated from the new
board state.

## Cities

Build a city on any empty intersection by paying one red, one blue, and one
yellow cube from the current player's hand. Paid cubes return to the unlimited
common supply and do not affect board cube totals.

Each owned city is worth 1 contribution at game end.

## End Game

The game ends after round 3 when every player's hand is empty. Final contribution
is card-scoring contribution plus owned city count. The player or players with
the highest final contribution win; tied winners are shared.

## Controls

- Start a new game from the setup screen with 2-4 display names.
- During draft, click a card from the current pack.
- During action phase, choose a hand card and one of its three uses.
- Use the city build panel before or after card use while the current player can
  pay the city cost.
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
