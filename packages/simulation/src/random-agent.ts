import { toPublicState, type GameState } from "@sdb/game-core";
import { cubeColors, type GameAction } from "@sdb/protocol";
import { cardUseActions, endTurnActions } from "./legal-actions";
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
