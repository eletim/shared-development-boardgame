import {
  toPublicState,
  getAreaColor,
  type AreaState,
  type CubeCounts,
  type GameState,
} from "@sdb/game-core";
import { cubeColors, type GameAction } from "@sdb/protocol";
import { endTurnActionResults, enumerateLegalActionResults } from "./legal-actions";
import { SeededRng } from "./rng";
import type { AgentConfig } from "./types";

export const ruleBasedScoreCoefficients = {
  cubeMarginalValues: [10, 7, 4] as const,
  cubeMarginalValueAfterThird: 2,
  cityBuildByAdjacentAreaCount: {
    1: 20,
    2: 50,
    3: 80,
  },
  neutralToColorPerAdjacentOwnCity: 30,
  sameColorStrengthenPerAdjacentOwnCity: 9,
  contribution: 20,
} as const;

export const createRuleBasedAgents = (playerCount: number): Record<string, AgentConfig> =>
  Object.fromEntries(
    Array.from({ length: playerCount }, (_, index) => {
      const playerId = `player-${index + 1}`;
      return [playerId, { type: "rule-based", name: `RuleBased Agent ${index + 1}` }];
    })
  );

export const scoreCubeCount = (count: number): number => {
  let score = 0;
  for (let index = 0; index < count; index += 1) {
    score += ruleBasedScoreCoefficients.cubeMarginalValues[index] ??
      ruleBasedScoreCoefficients.cubeMarginalValueAfterThird;
  }
  return score;
};

export const scoreCubeInventory = (cubes: CubeCounts): number =>
  cubeColors.reduce((total, color) => total + scoreCubeCount(cubes[color]), 0);

const playerById = (state: GameState, playerId: string) =>
  state.players.find((player) => player.id === playerId);

const areaById = (areas: AreaState[], areaId: string): AreaState | null =>
  areas.find((area) => area.id === areaId) ?? null;

const adjacentOwnCityPieces = (state: GameState, playerId: string, areaId: string): number =>
  state.intersections
    .filter((intersection) => intersection.adjacentAreaIds.includes(areaId))
    .reduce(
      (total, intersection) =>
        total + intersection.cityStack.filter((city) => city.playerId === playerId).length,
      0
    );

const cityBuildScore = (
  before: GameState,
  action: GameAction
): number => {
  if (action.type !== "BUILD_CITY") return 0;
  const intersection = before.intersections.find(
    (candidate) => candidate.id === action.intersectionId
  );
  if (!intersection) return 0;
  const adjacentAreaCount = Math.min(intersection.adjacentAreaIds.length, 3) as 1 | 2 | 3;
  return ruleBasedScoreCoefficients.cityBuildByAdjacentAreaCount[adjacentAreaCount] ?? 0;
};

const areaChangeScore = (
  before: GameState,
  after: GameState,
  playerId: string
): number => {
  let score = 0;
  for (const beforeArea of before.areas) {
    const afterArea = areaById(after.areas, beforeArea.id);
    if (!afterArea) continue;

    const beforeColor = getAreaColor(beforeArea.cubes);
    const afterColor = getAreaColor(afterArea.cubes);
    const ownCityPieces = adjacentOwnCityPieces(after, playerId, beforeArea.id);
    if (ownCityPieces === 0) continue;

    if (beforeColor === "neutral" && afterColor !== "neutral") {
      score += ruleBasedScoreCoefficients.neutralToColorPerAdjacentOwnCity * ownCityPieces;
      continue;
    }

    if (
      beforeColor !== "neutral" &&
      beforeColor === afterColor &&
      afterArea.cubes[beforeColor] > beforeArea.cubes[beforeColor]
    ) {
      score += ruleBasedScoreCoefficients.sameColorStrengthenPerAdjacentOwnCity * ownCityPieces;
    }
  }
  return score;
};

export const scoreRuleBasedAction = (
  before: GameState,
  after: GameState,
  actingPlayerId: string,
  action: GameAction
): number => {
  const beforePlayer = playerById(before, actingPlayerId);
  const afterPlayer = playerById(after, actingPlayerId);
  if (!beforePlayer || !afterPlayer) return Number.NEGATIVE_INFINITY;

  const cubeScore = scoreCubeInventory(afterPlayer.cubes) - scoreCubeInventory(beforePlayer.cubes);
  const contributionScore = Math.max(0, afterPlayer.contribution - beforePlayer.contribution) *
    ruleBasedScoreCoefficients.contribution;

  return cubeScore +
    cityBuildScore(before, action) +
    areaChangeScore(before, after, actingPlayerId) +
    contributionScore;
};

const cardContinuationMaxDepth = 8;

type CardEvaluationTerminalState = {
  state: GameState;
  actions: GameAction[];
};

const isCardEvaluationTerminal = (
  beforeCardUse: GameState,
  current: GameState,
  actingPlayerId: string
): boolean => {
  if (current.status === "ended") return true;
  if (current.round !== beforeCardUse.round) return true;
  return current.players[current.currentPlayerIndex]?.id !== actingPlayerId;
};

const claimWorldLevelBonusActionResults = (state: GameState) => {
  const player = state.players[state.currentPlayerIndex];
  const results = enumerateLegalActionResults(state);
  return cubeColors.flatMap((color) => {
    const result = results.find(
      (candidate) =>
        candidate.action.type === "CLAIM_WORLD_LEVEL_BONUS" &&
        candidate.action.playerId === player.id &&
        candidate.action.color === color
    );
    return result ? [result] : [];
  });
};

export const cardEvaluationTerminalStates = (
  beforeCardUse: GameState,
  afterCardUse: GameState,
  actingPlayerId: string,
  depth = 0,
  actions: GameAction[] = []
): CardEvaluationTerminalState[] => {
  if (isCardEvaluationTerminal(beforeCardUse, afterCardUse, actingPlayerId)) {
    return [{ state: afterCardUse, actions }];
  }

  if (depth >= cardContinuationMaxDepth) return [{ state: afterCardUse, actions }];

  const legal = toPublicState(afterCardUse).legal;
  const continuationResults = legal.canClaimWorldLevelBonus
    ? claimWorldLevelBonusActionResults(afterCardUse)
    : legal.canEndTurn
      ? endTurnActionResults(afterCardUse)
      : [];

  if (continuationResults.length === 0) return [{ state: afterCardUse, actions }];

  return continuationResults.flatMap((result) =>
    cardEvaluationTerminalStates(
      beforeCardUse,
      result.state,
      actingPlayerId,
      depth + 1,
      [...actions, result.action]
    )
  );
};

const cardEvaluationStateKey = (state: GameState): string =>
  JSON.stringify({
    status: state.status,
    phase: state.phase,
    round: state.round,
    maxRounds: state.maxRounds,
    worldLevel: state.worldLevel,
    worldLevelUnlocks: state.worldLevelUnlocks,
    pendingWorldLevelBonuses: state.pendingWorldLevelBonuses,
    currentPlayerIndex: state.currentPlayerIndex,
    turnCardUsed: state.turnCardUsed,
    turnEndProductionColor: state.turnEndProductionColor,
    turnEndSpecialDevelopment: state.turnEndSpecialDevelopment,
    players: state.players.map((player) => ({
      id: player.id,
      cubes: player.cubes,
      contribution: player.contribution,
      handCardCount: player.handCards.length,
    })),
    areas: state.areas.map((area) => ({ id: area.id, cubes: area.cubes })),
    intersections: state.intersections.map((intersection) => ({
      id: intersection.id,
      cityStack: intersection.cityStack,
    })),
  });

const scoreRuleBasedCandidate = (
  before: GameState,
  after: GameState,
  action: GameAction,
  cardScoreCache?: Map<string, number>
): number => {
  if (action.type !== "USE_CARD") {
    return scoreRuleBasedAction(before, after, action.playerId, action);
  }

  const cacheKey = cardEvaluationStateKey(after);
  const cachedScore = cardScoreCache?.get(cacheKey);
  if (cachedScore !== undefined) return cachedScore;

  const terminalStates = cardEvaluationTerminalStates(before, after, action.playerId);
  const score = terminalStates.reduce(
    (best, terminal) =>
      Math.max(best, scoreRuleBasedAction(before, terminal.state, action.playerId, action)),
    Number.NEGATIVE_INFINITY
  );
  cardScoreCache?.set(cacheKey, score);
  return score;
};

export const selectRuleBasedAgentAction = (
  state: GameState,
  rng: SeededRng
): GameAction | null => {
  const results = enumerateLegalActionResults(state);
  if (results.length === 0) return null;

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestActions: GameAction[] = [];
  const cardScoreCache = new Map<string, number>();
  for (const { action, state: after } of results) {
    const score = scoreRuleBasedCandidate(state, after, action, cardScoreCache);
    if (score > bestScore) {
      bestScore = score;
      bestActions = [action];
    } else if (score === bestScore) {
      bestActions.push(action);
    }
  }

  return bestActions.length > 0 ? rng.pick(bestActions) : null;
};
