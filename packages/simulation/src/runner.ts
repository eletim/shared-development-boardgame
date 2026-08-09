import {
  applyAction,
  cardDefinitions,
  createInitialState,
  getAreaColor,
  getAreaLevel,
  toPublicState,
  type GameState,
} from "@sdb/game-core";
import { cubeColors, type CardType, type CardUseMode, type CubeCounts, type GameAction } from "@sdb/protocol";
import { createRandomAgents, selectRandomAgentAction } from "./random-agent";
import { SeededRng } from "./rng";
import {
  simulationSchemaVersion,
  type AgentConfig,
  type CompletedGameRecord,
  type FailedGameRecord,
  type GameRecord,
  type GameStats,
  type ReplayEventType,
  type ReplaySnapshot,
  type ReplayStep,
} from "./types";

const maxDefaultDecisions = 20_000;
const cardTypes: CardType[] = [
  "red-production",
  "blue-production",
  "yellow-production",
  "tricolor-city",
  "neutral-development",
];
const cardModes: CardUseMode[] = ["production", "scoring", "basic"];

const emptyCubeCounts = (): CubeCounts => ({ red: 0, blue: 0, yellow: 0 });

const emptyCardTypeCounts = (): Record<CardType, number> =>
  Object.fromEntries(cardTypes.map((type) => [type, 0])) as Record<CardType, number>;

const emptyCardModeCounts = (): Record<CardUseMode, number> =>
  Object.fromEntries(cardModes.map((mode) => [mode, 0])) as Record<CardUseMode, number>;

const emptyCityLevelCounts = (): Record<1 | 2 | 3, number> => ({ 1: 0, 2: 0, 3: 0 });

const clone = <T>(value: T): T => structuredClone(value) as T;

const currentPlayerId = (state: GameState): string | null =>
  state.status === "active" ? state.players[state.currentPlayerIndex].id : null;

const createReplaySnapshot = (state: GameState): ReplaySnapshot => {
  const publicState = toPublicState(state);
  return {
    status: publicState.status,
    phase: publicState.phase,
    round: publicState.round,
    maxRounds: publicState.maxRounds,
    worldLevel: publicState.worldLevel,
    cityLevel: publicState.cityLevel,
    areaCapacity: publicState.areaCapacity,
    boardCubeTotal: publicState.boardCubeTotal,
    highestContribution: publicState.highestContribution,
    nextWorldLevelThreshold: publicState.nextWorldLevelThreshold,
    pendingWorldLevelBonus: publicState.pendingWorldLevelBonus,
    worldLevelUnlocks: publicState.worldLevelUnlocks,
    currentPlayerId: publicState.currentPlayerId,
    currentPlayerName: publicState.currentPlayerName,
    turnCardUsed: publicState.turnCardUsed,
    turnEndProduction: publicState.turnEndProduction,
    turnEndDevelopment: publicState.turnEndDevelopment,
    draftPickNumber: publicState.draftPickNumber,
    players: publicState.players,
    areas: publicState.areas,
    intersections: publicState.intersections,
    lastProduction: publicState.lastProduction,
    winners: publicState.winners,
    draftPacks: state.draftPacks.map((pack) =>
      pack.map((card) => ({ instanceId: card.instanceId, ...cardDefinitions[card.type] }))
    ),
  };
};

const createStats = (): GameStats => ({
  worldLevelUnlocks: [],
  draftedCards: emptyCardTypeCounts(),
  usedCards: emptyCardTypeCounts(),
  cardUseModes: emptyCardModeCounts(),
  tricolorBonusCount: 0,
  neutralDevelopmentBonusCount: 0,
  neutralDevelopmentBonusCubes: emptyCubeCounts(),
  cityBuildsByLevel: emptyCityLevelCounts(),
  emptyIntersectionBuilds: 0,
  stackedCityBuilds: 0,
  roundEndAreaStats: [],
});

const appendReplay = (
  replay: ReplayStep[],
  state: GameState,
  eventType: ReplayEventType,
  action: GameAction | null,
  details: Record<string, unknown> = {}
): number => {
  const step = replay.length;
  replay.push({
    step,
    eventType,
    round: state.round,
    playerId: action?.playerId ?? currentPlayerId(state),
    action: action ? clone(action) : null,
    details,
    snapshot: createReplaySnapshot(state),
  });
  return step;
};

const playerById = (state: GameState, playerId: string) =>
  state.players.find((player) => player.id === playerId);

const cardTypeBeforeUse = (
  before: GameState,
  action: Extract<GameAction, { type: "USE_CARD" }>
): CardType | null =>
  playerById(before, action.playerId)?.handCards.find(
    (card) => card.instanceId === action.cardInstanceId
  )?.type ?? null;

const cubeDelta = (before: CubeCounts, after: CubeCounts): CubeCounts => ({
  red: after.red - before.red,
  blue: after.blue - before.blue,
  yellow: after.yellow - before.yellow,
});

const spentPlacementCubes = (
  placements: Extract<GameAction, { type: "END_TURN" }>["placements"]
): CubeCounts => {
  const spent = emptyCubeCounts();
  for (const placement of placements ?? []) {
    spent[placement.color] += 1;
  }
  return spent;
};

const normalizeCubeCounts = (cubes: Partial<CubeCounts> | undefined): CubeCounts => ({
  red: cubes?.red ?? 0,
  blue: cubes?.blue ?? 0,
  yellow: cubes?.yellow ?? 0,
});

const cubeTotal = (cubes: CubeCounts): number =>
  cubeColors.reduce((total, color) => total + cubes[color], 0);

const roundEndStats = (state: GameState, round: number): GameStats["roundEndAreaStats"][number] => {
  const areas = state.areas.map((area) => ({
    areaId: area.id,
    color: getAreaColor(area.cubes),
    areaLevel: getAreaLevel(area.cubes),
    cubes: clone(area.cubes),
  }));
  return {
    round,
    areas,
    neutralAreaCount: areas.filter((area) => area.color === "neutral").length,
  };
};

const recordActionStats = (
  stats: GameStats,
  before: GameState,
  after: GameState,
  action: GameAction,
  replay: ReplayStep[]
): void => {
  if (action.type === "DRAFT_PICK") {
    const card = before.draftPacks[before.currentPlayerIndex]?.find(
      (candidate) => candidate.instanceId === action.cardInstanceId
    );
    if (card) stats.draftedCards[card.type] += 1;
    appendReplay(replay, after, "draft_pick", action, { cardType: card?.type ?? null });
  }

  if (action.type === "USE_CARD") {
    const cardType = cardTypeBeforeUse(before, action);
    if (cardType) stats.usedCards[cardType] += 1;
    stats.cardUseModes[action.mode] += 1;
    appendReplay(replay, after, "card_use", action, { cardType, mode: action.mode });
  }

  if (action.type === "BUILD_CITY") {
    const beforeIntersection = before.intersections.find(
      (intersection) => intersection.id === action.intersectionId
    );
    const builtLevel = ((beforeIntersection?.cityStack.length ?? 0) + 1) as 1 | 2 | 3;
    stats.cityBuildsByLevel[builtLevel] += 1;
    if ((beforeIntersection?.cityStack.length ?? 0) === 0) stats.emptyIntersectionBuilds += 1;
    else stats.stackedCityBuilds += 1;
    appendReplay(replay, after, "city_build", action, { level: builtLevel });
  }

  if (action.type === "CLAIM_WORLD_LEVEL_BONUS") {
    appendReplay(replay, after, "world_level_bonus", action, { color: action.color });
  }

  for (const beforePlayer of before.players) {
    const afterPlayer = playerById(after, beforePlayer.id);
    if (!afterPlayer) continue;
    const gained = afterPlayer.contribution - beforePlayer.contribution;
    if (gained > 0) {
      appendReplay(replay, after, "score_gain", action, {
        playerId: beforePlayer.id,
        amount: gained,
      });
    }
  }

  const knownUnlocks = new Set(before.worldLevelUnlocks.map((unlock) => unlock.level));
  for (const unlock of after.worldLevelUnlocks) {
    if (!knownUnlocks.has(unlock.level)) {
      const step = appendReplay(replay, after, "world_level_unlock", action, {
        level: unlock.level,
        playerId: unlock.playerId,
      });
      stats.worldLevelUnlocks.push({
        level: unlock.level,
        step,
        round: after.round,
        playerId: unlock.playerId,
      });
    }
  }

  if (action.type === "END_TURN") {
    const beforePlayer = playerById(before, action.playerId);
    const afterPlayer = playerById(after, action.playerId);
    if (before.turnEndSpecialDevelopment) {
      appendReplay(replay, after, "special_development", action, {
        developmentType: before.turnEndSpecialDevelopment,
      });
      if (beforePlayer && afterPlayer) {
        const spent = spentPlacementCubes(action.placements);
        const grossGained = cubeDelta(beforePlayer.cubes, afterPlayer.cubes);
        for (const color of cubeColors) {
          grossGained[color] += spent[color];
        }
        if (
          before.turnEndSpecialDevelopment === "tricolor-city" &&
          cubeColors.every((color) => grossGained[color] >= 1)
        ) {
          stats.tricolorBonusCount += 1;
        }
        const neutralBonus = normalizeCubeCounts(action.bonusCubes);
        if (before.turnEndSpecialDevelopment === "neutral-development" && cubeTotal(neutralBonus) > 0) {
          stats.neutralDevelopmentBonusCount += 1;
          for (const color of cubeColors) {
            stats.neutralDevelopmentBonusCubes[color] += neutralBonus[color];
          }
        }
      }
    } else {
      appendReplay(replay, after, "turn_end_development", action, {
        placed: action.placement ?? null,
      });
    }
  }

  if (action.type === "END_TURN" && (after.round !== before.round || after.status === "ended")) {
    stats.roundEndAreaStats.push(roundEndStats(after, before.round));
    appendReplay(replay, after, "round_end", action, { round: before.round });
  }

  if (action.type === "END_TURN" && after.status === "active" && after.round !== before.round) {
    appendReplay(replay, after, "round_start", null, { round: after.round });
    appendReplay(replay, after, "city_production", null, { production: clone(after.lastProduction) });
  }

  if (after.status === "ended" && before.status !== "ended") {
    appendReplay(replay, after, "game_end", action, {
      winners: toPublicState(after).winners.map((winner) => winner.id),
    });
  }
};

const failRecord = (
  gameId: string,
  gameSeed: string,
  playerCount: number,
  agents: Record<string, AgentConfig>,
  replay: ReplayStep[],
  reason: string,
  decisionCount: number,
  state: GameState
): FailedGameRecord => {
  appendReplay(replay, state, "failure", null, { reason, decisionCount });
  return {
    schemaVersion: simulationSchemaVersion,
    status: "failed",
    gameId,
    gameSeed,
    playerCount,
    agents,
    failure: { reason, decisionCount },
    replay,
  };
};

const completeRecord = (
  gameId: string,
  gameSeed: string,
  playerCount: number,
  agents: Record<string, AgentConfig>,
  stats: GameStats,
  replay: ReplayStep[],
  state: GameState
): CompletedGameRecord => {
  const publicState = toPublicState(state);
  const sorted = publicState.players
    .map((player) => ({
      playerId: player.id,
      agent: agents[player.id],
      finalScore: player.finalScore,
      contribution: player.contribution,
      cityCount: player.cityCount,
      rank: 1,
    }))
    .sort((first, second) => second.finalScore - first.finalScore || first.playerId.localeCompare(second.playerId));

  for (let index = 0; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    sorted[index].rank =
      previous && previous.finalScore === sorted[index].finalScore ? previous.rank : index + 1;
  }

  const byPlayerId = new Map(sorted.map((result) => [result.playerId, result]));
  return {
    schemaVersion: simulationSchemaVersion,
    status: "completed",
    gameId,
    gameSeed,
    playerCount,
    agents,
    finalScores: publicState.players.map((player) => byPlayerId.get(player.id)!),
    rankings: sorted,
    winners: publicState.winners.map((winner) => winner.id),
    finalWorldLevel: publicState.worldLevel,
    finalBoard: publicState.areas,
    finalCityStacks: publicState.intersections,
    stats,
    replay,
  };
};

export type SimulateGameOptions = {
  gameId: string;
  gameSeed: string;
  playerCount: number;
  agents?: Record<string, AgentConfig>;
  maxDecisions?: number;
};

export const simulateGame = ({
  gameId,
  gameSeed,
  playerCount,
  agents = createRandomAgents(playerCount),
  maxDecisions = maxDefaultDecisions,
}: SimulateGameOptions): GameRecord => {
  const rng = new SeededRng(gameSeed);
  const playerNames = Array.from({ length: playerCount }, (_, index) => `Player ${index + 1}`);
  const stats = createStats();
  const replay: ReplayStep[] = [];
  let state = createInitialState(playerNames);
  appendReplay(replay, state, "game_start", null, { gameSeed, playerCount });
  appendReplay(replay, state, "round_start", null, { round: state.round });
  appendReplay(replay, state, "city_production", null, { production: clone(state.lastProduction) });

  for (let decisionCount = 0; decisionCount < maxDecisions; decisionCount += 1) {
    if (state.status === "ended") {
      return completeRecord(gameId, gameSeed, playerCount, agents, stats, replay, state);
    }

    const action = selectRandomAgentAction(state, rng);
    if (!action) {
      return failRecord(
        gameId,
        gameSeed,
        playerCount,
        agents,
        replay,
        "No legal simulation action could be selected",
        decisionCount,
        state
      );
    }

    const before = state;
    const result = applyAction(state, action);
    if (!result.ok) {
      return failRecord(
        gameId,
        gameSeed,
        playerCount,
        agents,
        replay,
        result.error,
        decisionCount + 1,
        state
      );
    }
    state = result.state;
    recordActionStats(stats, before, state, action, replay);
  }

  return failRecord(
    gameId,
    gameSeed,
    playerCount,
    agents,
    replay,
    `Exceeded max decisions (${maxDecisions})`,
    maxDecisions,
    state
  );
};

export const deriveGameSeeds = (runSeed: string, games: number): string[] => {
  const rng = new SeededRng(runSeed);
  return Array.from(
    { length: games },
    (_, index) => `${runSeed}:game-${index + 1}:${rng.nextUint32().toString(16).padStart(8, "0")}`
  );
};

export const simulateGames = (
  runSeed: string,
  games: number,
  playerCount: number,
  maxDecisions?: number
): GameRecord[] =>
  deriveGameSeeds(runSeed, games).map((gameSeed, index) =>
    simulateGame({
      gameId: `game-${String(index + 1).padStart(6, "0")}`,
      gameSeed,
      playerCount,
      maxDecisions,
    })
  );
