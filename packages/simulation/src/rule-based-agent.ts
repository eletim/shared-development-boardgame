import {
  getAreaColor,
  type AreaState,
  type CubeCounts,
  type GameState,
} from "@sdb/game-core";
import { cubeColors, type GameAction } from "@sdb/protocol";
import { enumerateLegalActionResults } from "./legal-actions";
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

export const selectRuleBasedAgentAction = (
  state: GameState,
  rng: SeededRng
): GameAction | null => {
  const results = enumerateLegalActionResults(state);
  if (results.length === 0) return null;

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestActions: GameAction[] = [];
  for (const { action, state: after } of results) {
    const score = scoreRuleBasedAction(state, after, action.playerId, action);
    if (score > bestScore) {
      bestScore = score;
      bestActions = [action];
    } else if (score === bestScore) {
      bestActions.push(action);
    }
  }

  return bestActions.length > 0 ? rng.pick(bestActions) : null;
};
