# shared-development-boardgame

Hex Cube Cities is a local hot-seat board game prototype for 2-4 human players.
Players take cubes from a shared supply, place cubes into shared hex areas, and
spend adjacent shared cubes to build cities on shared intersections.

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
- The shared supply starts with 15 cubes of each color.
- Cubes are always in exactly one place: supply, a player's hand, or a hex area.
- Each player can hold up to 10 cubes.
- One turn performs exactly one action: take cubes, place cubes, build a city, or
  pass.
- Valid actions automatically advance to the next player. Invalid actions do not
  change state or advance the turn.
- The server is the source of truth for game state and rule validation.

## Phases

The current phase is derived from total built cities.

| Phase | Total cities | Area capacity |
| --- | ---: | ---: |
| 1 | 0-3 | 3 |
| 2 | 4-7 | 5 |
| 3 | 8+ | 7 |

Area capacity is the total number of cubes in an area, not a per-color limit.

## Actions

### Take Cubes

Choose one of:

- one red, one blue, and one yellow cube
- two cubes of the same color

Taking two of one color requires at least four cubes of that color in the shared
supply. The action cannot exceed the hand limit of 10 cubes.

### Place Cubes

Place 1-3 cubes from the current player's hand into one hex area. Colors can be
mixed. Placed cubes become shared and keep no owner.

### Build City

Choose an empty intersection and pay one red, one blue, and one yellow cube from
areas adjacent to that intersection. Each color's payment source is selected
separately. Paid cubes return to the shared supply, then the current player's
city is placed on the intersection.

### Pass

Pass is always legal while the game is active.

## End Game

The game ends after every player has taken 12 turns. All players take the same
number of turns. The player or players with the most cities win; tied winners are
shown without additional tie-breakers.

## Controls

- Start a new game from the setup screen with 2-4 display names.
- Use the action tabs to take, place, build, or pass.
- In place mode, select an area from the form or click a highlighted hex.
- In build mode, select an intersection from the form or click a highlighted
  intersection, then choose the payment source for red, blue, and yellow.
- Undo restores the full state before the most recent successful turn action.
- Reset restarts the current player set from the initial state.
- Recent action history and server-side errors are shown beside the board.

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
- facility cards, technologies, area powers, decks, random events, or hidden
  information
- AI players
- online multiplayer, WebSocket synchronization, authentication, persistence,
  database storage, matchmaking, or multiple simultaneous games
- board expansion
- high-quality art assets
