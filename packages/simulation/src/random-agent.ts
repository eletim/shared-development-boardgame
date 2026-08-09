import {
  applyAction,
  getAreaColor,
  toPublicState,
  type GameState,
} from "@sdb/game-core";
import { cubeColors, type CubeColor, type EndTurnPlacement, type GameAction } from "@sdb/protocol";
import { SeededRng } from "./rng";
import type { AgentConfig } from "./types";

export const createRandomAgents = (playerCount: number): Record<string, AgentConfig> =>
  Object.fromEntries(
    Array.from({ length: playerCount }, (_, index) => {
      const playerId = `player-${index + 1}`;
      return [playerId, { type: "random", name: `Random Agent ${index + 1}` }];
    })
  );

const currentPlayer = (state: GameState) => state.players[state.currentPlayerIndex];

const legalOnly = (state: GameState, actions: GameAction[]): GameAction[] =>
  actions.filter((action) => applyAction(state, action).ok);

const bonusAllocations = (total: number): Partial<Record<CubeColor, number>>[] => {
  const allocations: Partial<Record<CubeColor, number>>[] = [];
  for (let red = 0; red <= total; red += 1) {
    for (let blue = 0; blue <= total - red; blue += 1) {
      allocations.push({ red, blue, yellow: total - red - blue });
    }
  }
  return allocations;
};

const canPayPlacements = (
  state: GameState,
  placements: EndTurnPlacement[]
): boolean => {
  const cubes = { ...currentPlayer(state).cubes };
  for (const placement of placements) {
    if (cubes[placement.color] <= 0) return false;
    cubes[placement.color] -= 1;
  }
  return true;
};

const estimateNeutralDevelopmentBonus = (
  state: GameState,
  areaId: string,
  placements: EndTurnPlacement[]
): number => {
  const area = state.areas.find((candidate) => candidate.id === areaId);
  if (!area) return 0;
  const cubes = { ...area.cubes };
  for (const placement of placements) {
    cubes[placement.color] += 1;
  }
  if (getAreaColor(cubes) !== "neutral") return 0;
  return state.intersections
    .filter((intersection) => intersection.adjacentAreaIds.includes(areaId))
    .reduce((total, intersection) => total + intersection.cityStack.length, 0);
};

const placementChoices = (state: GameState, areaIds: string[]): EndTurnPlacement[] => {
  const player = currentPlayer(state);
  const choices: EndTurnPlacement[] = [];
  for (const areaId of areaIds) {
    for (const color of cubeColors) {
      if (player.cubes[color] > 0) choices.push({ areaId, color });
    }
  }
  return choices;
};

const cardUseActions = (state: GameState): GameAction[] => {
  const player = currentPlayer(state);
  const actions: GameAction[] = [];
  for (const card of player.handCards) {
    actions.push({
      type: "USE_CARD",
      playerId: player.id,
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    if (card.type !== "tricolor-city" && card.type !== "neutral-development") {
      actions.push({
        type: "USE_CARD",
        playerId: player.id,
        cardInstanceId: card.instanceId,
        mode: "scoring",
      });
    }
    for (const basicColor of cubeColors) {
      actions.push({
        type: "USE_CARD",
        playerId: player.id,
        cardInstanceId: card.instanceId,
        mode: "basic",
        basicColor,
      });
    }
  }
  return legalOnly(state, actions);
};

const normalEndTurnActions = (state: GameState): GameAction[] => {
  const player = currentPlayer(state);
  const legal = toPublicState(state).legal;
  const actions: GameAction[] = [{ type: "END_TURN", playerId: player.id }];
  for (const placement of placementChoices(state, legal.placeableAreaIds)) {
    actions.push({ type: "END_TURN", playerId: player.id, placement });
  }
  return legalOnly(state, actions);
};

const tricolorEndTurnActions = (state: GameState): GameAction[] => {
  const player = currentPlayer(state);
  const legal = toPublicState(state).legal;
  const singlePlacements = placementChoices(state, legal.placeableAreaIds);
  const placementSets: EndTurnPlacement[][] = [[]];
  for (const placement of singlePlacements) {
    placementSets.push([placement]);
  }
  for (let firstIndex = 0; firstIndex < singlePlacements.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < singlePlacements.length; secondIndex += 1) {
      const placements = [singlePlacements[firstIndex], singlePlacements[secondIndex]];
      if (
        placements[0].areaId !== placements[1].areaId &&
        canPayPlacements(state, placements)
      ) {
        placementSets.push(placements);
      }
    }
  }
  return legalOnly(
    state,
    placementSets.map((placements) => ({ type: "END_TURN", playerId: player.id, placements }))
  );
};

const neutralEndTurnActions = (state: GameState): GameAction[] => {
  const player = currentPlayer(state);
  const legal = toPublicState(state).legal;
  const actions: GameAction[] = [];
  for (const area of state.areas) {
    const singlePlacements = placementChoices(state, [area.id]).filter((placement) =>
      legal.placeableAreaIds.includes(placement.areaId)
    );
    const placementSets: EndTurnPlacement[][] = [[]];
    for (const placement of singlePlacements) {
      placementSets.push([placement]);
    }
    for (const first of singlePlacements) {
      for (const second of singlePlacements) {
        const placements = [first, second];
        if (canPayPlacements(state, placements)) placementSets.push(placements);
      }
    }
    for (const placements of placementSets) {
      const expectedBonus = estimateNeutralDevelopmentBonus(state, area.id, placements);
      for (const bonusCubes of bonusAllocations(expectedBonus)) {
        actions.push({
          type: "END_TURN",
          playerId: player.id,
          placements,
          developmentAreaId: area.id,
          bonusCubes,
        });
      }
    }
  }
  return legalOnly(state, actions);
};

const endTurnActions = (state: GameState): GameAction[] => {
  if (state.turnEndSpecialDevelopment === "tricolor-city") return tricolorEndTurnActions(state);
  if (state.turnEndSpecialDevelopment === "neutral-development") return neutralEndTurnActions(state);
  return normalEndTurnActions(state);
};

export const selectRandomAgentAction = (
  state: GameState,
  rng: SeededRng
): GameAction | null => {
  const publicState = toPublicState(state);
  const player = currentPlayer(state);

  if (publicState.legal.canClaimWorldLevelBonus) {
    return { type: "CLAIM_WORLD_LEVEL_BONUS", playerId: player.id, color: rng.pick(cubeColors) };
  }

  if (publicState.legal.canDraft) {
    const card = rng.pick(publicState.legal.draftPack);
    return { type: "DRAFT_PICK", playerId: player.id, cardInstanceId: card.instanceId };
  }

  if (publicState.legal.canBuildCity && rng.chance(1, 2)) {
    return {
      type: "BUILD_CITY",
      playerId: player.id,
      intersectionId: rng.pick(publicState.legal.buildableIntersectionIds),
    };
  }

  if (publicState.legal.canUseCard) {
    const actions = cardUseActions(state);
    return actions.length > 0 ? rng.pick(actions) : null;
  }

  if (publicState.legal.canBuildCity && rng.chance(1, 2)) {
    return {
      type: "BUILD_CITY",
      playerId: player.id,
      intersectionId: rng.pick(publicState.legal.buildableIntersectionIds),
    };
  }

  if (publicState.legal.canEndTurn) {
    const actions = endTurnActions(state);
    return actions.length > 0 ? rng.pick(actions) : null;
  }

  return null;
};
