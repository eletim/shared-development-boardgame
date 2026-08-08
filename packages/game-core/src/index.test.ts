import { describe, expect, it } from "vitest";
import {
  applyAction,
  createBoardDefinition,
  createInitialState,
  getAreaLevel,
  getAreaCapacity,
  getAreaColor,
  getBoardCubeTotal,
  getCityLevel,
  getWorldLevelFromContribution,
  getWorldLevel,
  toPublicState,
  type CardInstance,
  type GameState,
} from "./index";
import { type CardType, type CubeColor, cubeColors, type GameAction } from "@sdb/protocol";

const play = (state: GameState, action: GameAction): GameState => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

const currentId = (state: GameState): string => state.players[state.currentPlayerIndex].id;

const endTurn = (
  state: GameState,
  placement?: Extract<GameAction, { type: "END_TURN" }>["placement"]
): GameState =>
  play(state, { type: "END_TURN", playerId: currentId(state), placement });

const claimBonus = (state: GameState, color: CubeColor): GameState =>
  play(state, { type: "CLAIM_WORLD_LEVEL_BONUS", playerId: currentId(state), color });

const draftAll = (state: GameState): GameState => {
  let next = state;
  while (next.phase === "draft") {
    const card = next.draftPacks[next.currentPlayerIndex][0];
    next = play(next, {
      type: "DRAFT_PICK",
      playerId: currentId(next),
      cardInstanceId: card.instanceId,
    });
  }
  return next;
};

const cardOfType = (state: GameState, playerIndex: number, type: CardType): CardInstance => {
  const card = state.players[playerIndex].handCards.find((candidate) => candidate.type === type);
  if (!card) throw new Error(type);
  return card;
};

const addBoardCubes = (
  state: GameState,
  areaId: string,
  cubes: Partial<Record<CubeColor, number>>
) => {
  const area = state.areas.find((candidate) => candidate.id === areaId);
  if (!area) throw new Error(areaId);
  for (const color of cubeColors) {
    area.cubes[color] += cubes[color] ?? 0;
  }
};

const emptyIntersectionIds = (state: GameState, count: number): string[] =>
  state.intersections
    .filter((intersection) => intersection.cityStack.length === 0)
    .slice(0, count)
    .map((intersection) => intersection.id);

const prepareOnePointScoringCard = (
  state: GameState,
  playerId = currentId(state),
  cardId = "score-red"
): string => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(playerId);
  const intersection = state.intersections.find(
    (candidate) =>
      candidate.adjacentAreaIds.includes("area-center") &&
      candidate.cityStack.length === 0
  ) ?? state.intersections.find((candidate) =>
    candidate.adjacentAreaIds.includes("area-center")
  );
  if (!intersection) throw new Error("area-center intersection");
  if (!intersection.cityStack.some((city) => city.playerId === playerId)) {
    intersection.cityStack = [{ playerId }];
  }
  addBoardCubes(state, "area-center", { red: 1 });
  player.handCards = [{ instanceId: cardId, type: "red-production" }];
  return cardId;
};

describe("board definition", () => {
  it("generates seven areas and shared intersections", () => {
    const board = createBoardDefinition();
    expect(board.areas).toHaveLength(7);
    expect(board.intersections).toHaveLength(24);
    expect(board.intersections.filter((intersection) => intersection.adjacentAreaIds.length === 3)).toHaveLength(6);
    expect(board.intersections.filter((intersection) => intersection.adjacentAreaIds.length === 2)).toHaveLength(6);
    expect(board.intersections.filter((intersection) => intersection.adjacentAreaIds.length === 1)).toHaveLength(12);
  });
});

describe("area color and world level", () => {
  it.each([
    [{ red: 3, blue: 2, yellow: 1 }, "red"],
    [{ red: 2, blue: 1, yellow: 1 }, "red"],
    [{ red: 2, blue: 2, yellow: 1 }, "yellow"],
    [{ red: 3, blue: 3, yellow: 2 }, "yellow"],
    [{ red: 2, blue: 2, yellow: 0 }, "neutral"],
    [{ red: 1, blue: 1, yellow: 0 }, "neutral"],
    [{ red: 2, blue: 2, yellow: 2 }, "neutral"],
  ] as const)("uses tied-majority-loses area color for %o", (cubes, color) => {
    expect(getAreaColor(cubes)).toBe(color);
  });

  it("derives world level thresholds from highest contribution", () => {
    expect(getWorldLevelFromContribution(0)).toBe(1);
    expect(getWorldLevelFromContribution(14)).toBe(1);
    expect(getWorldLevelFromContribution(15)).toBe(2);
    expect(getWorldLevelFromContribution(44)).toBe(2);
    expect(getWorldLevelFromContribution(45)).toBe(3);

    const state = createInitialState(["A", "B"]);
    expect(getWorldLevel(state)).toBe(1);
    expect(getAreaCapacity(state)).toBe(2);
    expect(getCityLevel(state)).toBe(1);
    state.players[0].contribution = 14;
    expect(getWorldLevel(state)).toBe(1);
    state.worldLevel = getWorldLevelFromContribution(15);
    expect(getWorldLevel(state)).toBe(2);
    expect(getAreaCapacity(state)).toBe(4);
    expect(getCityLevel(state)).toBe(2);
    state.worldLevel = getWorldLevelFromContribution(45);
    expect(getWorldLevel(state)).toBe(3);
    expect(getAreaCapacity(state)).toBe(6);
    expect(getCityLevel(state)).toBe(3);
  });

  it.each([
    [{ red: 0, blue: 0, yellow: 0 }, 0],
    [{ red: 1, blue: 0, yellow: 0 }, 1],
    [{ red: 1, blue: 1, yellow: 0 }, 1],
    [{ red: 2, blue: 1, yellow: 0 }, 2],
    [{ red: 2, blue: 2, yellow: 0 }, 2],
    [{ red: 2, blue: 2, yellow: 1 }, 3],
    [{ red: 2, blue: 2, yellow: 2 }, 3],
  ] as const)("derives area level from total cubes for %o", (cubes, level) => {
    expect(getAreaLevel(cubes)).toBe(level);
  });

  it("keeps neutral areas developed without counting board cubes toward world level", () => {
    const state = createInitialState(["A", "B"]);
    addBoardCubes(state, "area-center", { red: 2, blue: 2 });
    expect(getAreaColor(state.areas.find((area) => area.id === "area-center")!.cubes)).toBe("neutral");
    expect(getAreaLevel(state.areas.find((area) => area.id === "area-center")!.cubes)).toBe(2);
    addBoardCubes(state, "area-east", { yellow: 50 });
    expect(getBoardCubeTotal(state)).toBe(54);
    expect(getWorldLevel(state)).toBe(1);
    expect(getAreaCapacity(state)).toBe(2);
  });
});

describe("score-based world level unlocks", () => {
  it("stays at Lv1 on 14 points and unlocks Lv2 immediately at 15 points", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].contribution = 14;
    const cardId = prepareOnePointScoringCard(state);

    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: cardId,
      mode: "scoring",
    });

    expect(state.players[0].contribution).toBe(15);
    expect(getWorldLevel(state)).toBe(2);
    expect(getAreaCapacity(state)).toBe(4);
    expect(getCityLevel(state)).toBe(2);
    expect(state.pendingWorldLevelBonuses).toEqual([{ level: 2, playerId: "player-1" }]);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnCardUsed).toBe(true);
  });

  it("stays at Lv2 on 44 points and unlocks Lv3 immediately at 45 points", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.worldLevel = 2;
    state.worldLevelUnlocks = [{ level: 2, playerId: "player-1", bonusColor: "red" }];
    state.players[0].contribution = 44;
    const cardId = prepareOnePointScoringCard(state);

    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: cardId,
      mode: "scoring",
    });

    expect(state.players[0].contribution).toBe(45);
    expect(getWorldLevel(state)).toBe(3);
    expect(getAreaCapacity(state)).toBe(6);
    expect(getCityLevel(state)).toBe(3);
    expect(state.pendingWorldLevelBonuses).toEqual([{ level: 3, playerId: "player-1" }]);
    expect(state.worldLevelUnlocks.filter((unlock) => unlock.level === 3)).toHaveLength(1);
  });

  it("only gives the unlock bonus to the unlocking player once per world level", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].contribution = 14;
    const cardId = prepareOnePointScoringCard(state);
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: cardId,
      mode: "scoring",
    });

    const blockedEndTurn = applyAction(state, { type: "END_TURN", playerId: "player-1" });
    expect(blockedEndTurn.ok).toBe(false);
    const blockedBuild = applyAction(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: state.intersections[1].id,
    });
    expect(blockedBuild.ok).toBe(false);

    state = claimBonus(state, "blue");
    expect(state.players[0].cubes.blue).toBe(1);
    expect(state.players[1].cubes.blue).toBe(0);
    expect(state.pendingWorldLevelBonuses).toHaveLength(0);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnCardUsed).toBe(true);

    state = endTurn(state);
    state.currentPlayerIndex = 1;
    state.turnCardUsed = false;
    state.players[1].contribution = 14;
    const otherCardId = prepareOnePointScoringCard(state, "player-2", "p2-score-red");
    const beforeCubes = { ...state.players[1].cubes };
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: otherCardId,
      mode: "scoring",
    });
    expect(state.players[1].contribution).toBe(15);
    expect(getWorldLevel(state)).toBe(2);
    expect(state.pendingWorldLevelBonuses).toHaveLength(0);
    expect(state.players[1].cubes).toEqual(beforeCubes);
    expect(state.worldLevelUnlocks.filter((unlock) => unlock.level === 2)).toHaveLength(1);
  });

  it("lets the unlocking player use the new city level and area capacity in the same turn", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const cityId = state.intersections.find((intersection) =>
      intersection.adjacentAreaIds.includes("area-center")
    )!.id;
    state.intersections.find((intersection) => intersection.id === cityId)!.cityStack = [
      { playerId: "player-1" },
    ];
    state.players[0].cubes = { red: 2, blue: 2, yellow: 2 };
    state.players[0].contribution = 14;
    addBoardCubes(state, "area-east", { blue: 2 });
    const cardId = prepareOnePointScoringCard(state);

    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: cardId,
      mode: "scoring",
    });
    state = claimBonus(state, "red");

    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    expect(toPublicState(state).intersections.find((intersection) => intersection.id === cityId)?.cityStack).toEqual([
      { playerId: "player-1", playerColor: "#d73a31", level: 1 },
      { playerId: "player-1", playerColor: "#d73a31", level: 2 },
    ]);
    state = endTurn(state, { areaId: "area-east", color: "red" });
    expect(state.areas.find((area) => area.id === "area-east")?.cubes).toEqual({
      red: 1,
      blue: 2,
      yellow: 0,
    });
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("lets Lv3 unlock enable Lv3 city builds and capacity 6 without auto-upgrading old cities", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.worldLevel = 2;
    state.worldLevelUnlocks = [{ level: 2, playerId: "player-1", bonusColor: "red" }];
    const cityId = state.intersections.find((intersection) =>
      intersection.adjacentAreaIds.includes("area-center")
    )!.id;
    state.intersections.find((intersection) => intersection.id === cityId)!.cityStack = [
      { playerId: "player-1" },
      { playerId: "player-1" },
    ];
    state.players[0].cubes = { red: 3, blue: 3, yellow: 3 };
    state.players[0].contribution = 44;
    addBoardCubes(state, "area-east", { blue: 4 });
    const cardId = prepareOnePointScoringCard(state);

    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: cardId,
      mode: "scoring",
    });
    state = claimBonus(state, "yellow");

    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    expect(toPublicState(state).intersections.find((intersection) => intersection.id === cityId)?.cityStack).toEqual([
      { playerId: "player-1", playerColor: "#d73a31", level: 1 },
      { playerId: "player-1", playerColor: "#d73a31", level: 2 },
      { playerId: "player-1", playerColor: "#d73a31", level: 3 },
    ]);
    state = endTurn(state, { areaId: "area-east", color: "yellow" });
    expect(state.areas.find((area) => area.id === "area-east")?.cubes).toEqual({
      red: 0,
      blue: 4,
      yellow: 1,
    });
    expect(getAreaCapacity(state)).toBe(6);
  });

  it("queues both Lv2 and Lv3 bonuses when one scoring action reaches 45 from Lv1", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].contribution = 44;
    const cardId = prepareOnePointScoringCard(state);

    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: cardId,
      mode: "scoring",
    });

    expect(getWorldLevel(state)).toBe(3);
    expect(state.worldLevelUnlocks).toEqual([
      { level: 2, playerId: "player-1", bonusColor: null },
      { level: 3, playerId: "player-1", bonusColor: null },
    ]);
    expect(state.pendingWorldLevelBonuses).toEqual([
      { level: 2, playerId: "player-1" },
      { level: 3, playerId: "player-1" },
    ]);

    state = claimBonus(state, "red");
    expect(state.pendingWorldLevelBonuses).toEqual([{ level: 3, playerId: "player-1" }]);
    state = claimBonus(state, "yellow");
    expect(state.pendingWorldLevelBonuses).toHaveLength(0);
    expect(state.worldLevelUnlocks).toEqual([
      { level: 2, playerId: "player-1", bonusColor: "red" },
      { level: 3, playerId: "player-1", bonusColor: "yellow" },
    ]);
  });

  it("restores score, world level, pending bonus, bonus cubes, and turn state from undo snapshots", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].contribution = 14;
    const cardId = prepareOnePointScoringCard(state);
    const undoStack: GameState[] = [];
    const dispatch = (action: GameAction) => {
      const before = structuredClone(state) as GameState;
      const result = applyAction(state, action);
      if (!result.ok) throw new Error(result.error);
      undoStack.push(before);
      state = result.state;
    };

    dispatch({
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: cardId,
      mode: "scoring",
    });
    dispatch({ type: "CLAIM_WORLD_LEVEL_BONUS", playerId: "player-1", color: "blue" });

    expect(state.players[0].contribution).toBe(15);
    expect(state.players[0].cubes.blue).toBe(1);
    expect(state.worldLevel).toBe(2);
    expect(state.pendingWorldLevelBonuses).toHaveLength(0);
    expect(state.turnCardUsed).toBe(true);

    state = undoStack.pop()!;
    expect(state.players[0].contribution).toBe(15);
    expect(state.players[0].cubes.blue).toBe(0);
    expect(state.worldLevel).toBe(2);
    expect(state.pendingWorldLevelBonuses).toEqual([{ level: 2, playerId: "player-1" }]);
    expect(state.turnCardUsed).toBe(true);
    expect(state.currentPlayerIndex).toBe(0);

    state = undoStack.pop()!;
    expect(state.players[0].contribution).toBe(14);
    expect(state.players[0].cubes.blue).toBe(0);
    expect(state.worldLevel).toBe(1);
    expect(state.worldLevelUnlocks).toHaveLength(0);
    expect(state.pendingWorldLevelBonuses).toHaveLength(0);
    expect(state.turnCardUsed).toBe(false);
    expect(state.currentPlayerIndex).toBe(0);
  });
});

describe("draft and card turns", () => {
  it("drafts eight public cards per player before action phase", () => {
    const state = draftAll(createInitialState(["A", "B", "C", "D"]));
    expect(state.phase).toBe("action");
    expect(state.players.every((player) => player.handCards.length === 8)).toBe(true);
    expect(state.draftPacks.every((pack) => pack.length === 0)).toBe(true);
  });

  it("uses any card for one cube and consumes exactly one hand card", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const card = state.players[0].handCards[0];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "basic",
      basicColor: "blue",
    });
    expect(state.players[0].cubes.blue).toBe(1);
    expect(state.players[0].handCards).toHaveLength(7);
    expect(state.turnCardUsed).toBe(true);
    expect(state.currentPlayerIndex).toBe(0);
    state = endTurn(state);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("uses red, blue, and yellow production cards for one immediate matching cube", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    for (const [type, color] of [
      ["red-production", "red"],
      ["blue-production", "blue"],
      ["yellow-production", "yellow"],
    ] as const) {
      const card = cardOfType(state, 0, type);
      state = play(state, {
        type: "USE_CARD",
        playerId: "player-1",
        cardInstanceId: card.instanceId,
        mode: "production",
      });
      expect(state.players[0].cubes[color]).toBe(1);
      expect(state.turnEndProductionColor).toBe(color);
      expect(state.turnCardUsed).toBe(true);
      state = endTurn(state);
      if (state.currentPlayerIndex !== 0) {
        const otherCard = state.players[state.currentPlayerIndex].handCards[0];
        state = play(state, {
          type: "USE_CARD",
          playerId: currentId(state),
          cardInstanceId: otherCard.instanceId,
          mode: "basic",
          basicColor: "red",
        });
        state = endTurn(state);
      }
    }
    expect(state.players[0].handCards).toHaveLength(5);
  });

  it("adds no red cubes at turn end when there are no red areas", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const card = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    expect(state.players[0].cubes.red).toBe(1);
    state = endTurn(state);
    expect(state.players[0].cubes.red).toBe(1);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("adds red cubes from the current red area count at turn end", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    addBoardCubes(state, "area-center", { red: 2 });
    addBoardCubes(state, "area-east", { red: 1 });
    const card = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    state = endTurn(state);
    expect(state.players[0].cubes.red).toBe(3);
  });

  it("uses the increased red area count after turn-end placement", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    addBoardCubes(state, "area-center", { red: 1 });
    addBoardCubes(state, "area-east", { red: 1 });
    const card = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    state = endTurn(state, { areaId: "area-northeast", color: "red" });
    expect(state.players[0].cubes.red).toBe(3);
    expect(getAreaColor(state.areas.find((area) => area.id === "area-northeast")!.cubes)).toBe("red");
  });

  it("uses the decreased red area count after turn-end placement", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    addBoardCubes(state, "area-center", { red: 1 });
    addBoardCubes(state, "area-east", { red: 1 });
    state.players[0].cubes.blue = 1;
    const card = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    state = endTurn(state, { areaId: "area-center", color: "blue" });
    expect(getAreaColor(state.areas.find((area) => area.id === "area-center")!.cubes)).toBe("neutral");
    expect(state.players[0].cubes.red).toBe(2);
  });

  it("uses the current red area count when turn-end placement is skipped", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    addBoardCubes(state, "area-center", { red: 1 });
    addBoardCubes(state, "area-east", { red: 1 });
    addBoardCubes(state, "area-west", { red: 1 });
    const card = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    state = endTurn(state);
    expect(state.players[0].cubes.red).toBe(4);
  });

  it.each([
    ["blue-production", "blue"],
    ["yellow-production", "yellow"],
  ] as const)("keeps %s production symmetric with red", (type, color) => {
    let state = draftAll(createInitialState(["A", "B"]));
    addBoardCubes(state, "area-center", { [color]: 1 });
    addBoardCubes(state, "area-east", { [color]: 1 });
    const card = cardOfType(state, 0, type);
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    expect(state.players[0].cubes[color]).toBe(1);
    state = endTurn(state);
    expect(state.players[0].cubes[color]).toBe(3);
  });

  it("does not advance to the next player until turn-end placement or skip resolves production", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    addBoardCubes(state, "area-center", { red: 1 });
    const card = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnCardUsed).toBe(true);
    expect(state.turnEndProductionColor).toBe("red");
    state = endTurn(state);
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.players[0].cubes.red).toBe(2);
  });

  it("places one cube at turn end and updates area color under the current world level capacity", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.worldLevel = 2;
    state.worldLevelUnlocks = [{ level: 2, playerId: "player-1", bonusColor: "red" }];
    addBoardCubes(state, "area-center", { red: 2 });
    addBoardCubes(state, "area-east", { blue: 2 });
    addBoardCubes(state, "area-northeast", { yellow: 2 });
    addBoardCubes(state, "area-northwest", { red: 2 });
    addBoardCubes(state, "area-southeast", { yellow: 4 });
    addBoardCubes(state, "area-west", { blue: 1 });
    expect(getBoardCubeTotal(state)).toBe(13);
    expect(getAreaCapacity(state)).toBe(4);

    state.players[0].cubes.red = 1;
    const card = state.players[0].handCards[0];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "basic",
      basicColor: "blue",
    });
    state = endTurn(state, { areaId: "area-center", color: "red" });
    expect(getBoardCubeTotal(state)).toBe(14);
    expect(getAreaCapacity(state)).toBe(4);
    expect(state.areas.find((area) => area.id === "area-center")?.cubes.red).toBe(3);
    expect(getAreaColor(state.areas.find((area) => area.id === "area-center")!.cubes)).toBe("red");
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("rejects invalid turn-end placements without advancing the turn or mutating state", () => {
    const state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes.red = 1;
    addBoardCubes(state, "area-center", { red: 2 });
    const card = state.players[0].handCards[0];
    const used = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "basic",
      basicColor: "blue",
    });
    const before = JSON.stringify(used);
    const result = applyAction(used, {
      type: "END_TURN",
      playerId: "player-1",
      placement: { areaId: "area-center", color: "red" },
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(used)).toBe(before);
    expect(used.currentPlayerIndex).toBe(0);
    expect(state.areas.find((area) => area.id === "area-center")?.cubes.red).toBe(2);
  });

  it("skips turn-end placement and then advances to the next player", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const card = state.players[0].handCards[0];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "basic",
      basicColor: "blue",
    });
    expect(state.turnCardUsed).toBe(true);
    state = endTurn(state);
    expect(getBoardCubeTotal(state)).toBe(0);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("scores color cards by summing each own city connection value", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const sharedRedCity = state.intersections.find((candidate) => candidate.adjacentAreaIds.length === 3)!;
    const singleRedCity = state.intersections.find(
      (candidate) =>
        candidate.id !== sharedRedCity.id &&
        candidate.adjacentAreaIds.includes(sharedRedCity.adjacentAreaIds[0])
    )!;
    sharedRedCity.cityStack = [{ playerId: "player-2" }, { playerId: "player-1" }];
    singleRedCity.cityStack = [{ playerId: "player-1" }];
    addBoardCubes(state, sharedRedCity.adjacentAreaIds[0], { red: 2 });
    addBoardCubes(state, sharedRedCity.adjacentAreaIds[1], { red: 4 });
    addBoardCubes(state, "area-east", { blue: 4 });
    expect(getCityLevel(state)).toBe(1);

    const redCard = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: redCard.instanceId,
      mode: "scoring",
    });
    expect(state.players[0].contribution).toBe(2 * 1 + 2 * 2 + 1 * 1 + 1 * 2);
    expect(state.players[0].handCards.some((candidate) => candidate.instanceId === redCard.instanceId)).toBe(false);
  });

  it("scores blue and yellow cards with the same connection-value rule", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const blueCity = state.intersections.find((candidate) => candidate.adjacentAreaIds.includes("area-center"))!;
    const yellowCity = state.intersections.find(
      (candidate) => candidate.id !== blueCity.id && candidate.adjacentAreaIds.includes("area-east")
    )!;
    blueCity.cityStack = [{ playerId: "player-1" }];
    yellowCity.cityStack = [{ playerId: "player-1" }, { playerId: "player-1" }];
    addBoardCubes(state, "area-center", { blue: 3 });
    addBoardCubes(state, "area-east", { yellow: 5 });

    const blueCard = cardOfType(state, 0, "blue-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: blueCard.instanceId,
      mode: "scoring",
    });
    expect(state.players[0].contribution).toBe(2);
    state = endTurn(state);
    const otherCard = state.players[1].handCards[0];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: otherCard.instanceId,
      mode: "basic",
      basicColor: "red",
    });
    state = endTurn(state);

    const yellowCard = cardOfType(state, 0, "yellow-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: yellowCard.instanceId,
      mode: "scoring",
    });
    expect(state.players[0].contribution).toBe(11);
  });

  it("ends a round when every player's hand is empty and starts production before the next draft", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-production" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-production" }];
    state.players[0].cubes = { red: 1, blue: 1, yellow: 1 };
    state.intersections[0].cityStack = [{ playerId: "player-1" }];
    addBoardCubes(state, state.intersections[0].adjacentAreaIds[0], { red: 2 });

    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = endTurn(state);
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });
    state = endTurn(state);

    expect(state.round).toBe(2);
    expect(state.phase).toBe("draft");
    expect(state.lastProduction.find((entry) => entry.playerId === "player-1")?.cubes.red).toBe(1);
    expect(state.players[0].handCards).toHaveLength(0);
    expect(state.draftPacks[0]).toHaveLength(8);
  });
});

describe("city rules and production", () => {
  it("pays city cost from hand cubes and does not remove board cubes", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes = { red: 1, blue: 1, yellow: 1 };
    addBoardCubes(state, "area-center", { red: 3 });
    const beforeBoardTotal = getBoardCubeTotal(state);
    state = play(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: emptyIntersectionIds(state, 1)[0],
    });
    expect(state.players[0].cubes).toEqual({ red: 0, blue: 0, yellow: 0 });
    expect(getBoardCubeTotal(state)).toBe(beforeBoardTotal);
    expect(state.intersections.flatMap((intersection) => intersection.cityStack).filter((city) => city.playerId === "player-1")).toHaveLength(1);
  });

  it("allows multiple city builds in the same turn while resources last", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes = { red: 2, blue: 2, yellow: 2 };
    const [first, second] = emptyIntersectionIds(state, 2);
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: first });
    expect(state.currentPlayerIndex).toBe(0);
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: second });
    expect(state.players[0].cubes).toEqual({ red: 0, blue: 0, yellow: 0 });
    expect(state.intersections.flatMap((intersection) => intersection.cityStack).filter((city) => city.playerId === "player-1")).toHaveLength(2);
  });

  it("allows city builds after the card action before turn-end placement or skip", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes = { red: 1, blue: 1, yellow: 1 };
    const card = state.players[0].handCards[0];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "basic",
      basicColor: "red",
    });
    const cityId = emptyIntersectionIds(state, 1)[0];
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnCardUsed).toBe(true);
    expect(state.intersections.find((intersection) => intersection.id === cityId)?.cityStack[0]?.playerId).toBe("player-1");
    state = endTurn(state);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("stacks cities on own and other players' cities without changing lower levels or owners", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const cityId = emptyIntersectionIds(state, 1)[0];
    state.players[0].cubes = { red: 3, blue: 3, yellow: 3 };

    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    expect(state.players[0].cubes).toEqual({ red: 2, blue: 2, yellow: 2 });

    let rejected = applyAction(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    expect(rejected.ok).toBe(false);
    expect(state.intersections.find((intersection) => intersection.id === cityId)?.cityStack).toEqual([
      { playerId: "player-1" },
    ]);

    addBoardCubes(state, "area-center", { red: 14 });
    state.worldLevel = 2;
    state.worldLevelUnlocks = [{ level: 2, playerId: "player-1", bonusColor: "red" }];
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    expect(state.players[0].cubes).toEqual({ red: 0, blue: 0, yellow: 0 });
    expect(state.intersections.find((intersection) => intersection.id === cityId)?.cityStack).toEqual([
      { playerId: "player-1" },
      { playerId: "player-1" },
    ]);

    const card = state.players[0].handCards[0];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "basic",
      basicColor: "red",
    });
    state = endTurn(state);
    state.players[1].cubes = { red: 3, blue: 3, yellow: 3 };
    rejected = applyAction(state, { type: "BUILD_CITY", playerId: "player-2", intersectionId: cityId });
    expect(rejected.ok).toBe(false);
    addBoardCubes(state, "area-east", { blue: 14 });
    state.worldLevel = 3;
    state.worldLevelUnlocks.push({ level: 3, playerId: "player-2", bonusColor: "blue" });
    state = play(state, { type: "BUILD_CITY", playerId: "player-2", intersectionId: cityId });
    expect(state.players[1].cubes).toEqual({ red: 0, blue: 0, yellow: 0 });
    expect(state.intersections.find((intersection) => intersection.id === cityId)?.cityStack).toEqual([
      { playerId: "player-1" },
      { playerId: "player-1" },
      { playerId: "player-2" },
    ]);
  });

  it("does not auto-upgrade existing city levels when world level rises", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const cityId = state.intersections.find((intersection) => intersection.adjacentAreaIds.includes("area-center"))!.id;
    state.players[0].cubes = { red: 1, blue: 1, yellow: 1 };
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    state.worldLevel = 3;
    state.worldLevelUnlocks = [
      { level: 2, playerId: "player-1", bonusColor: "red" },
      { level: 3, playerId: "player-1", bonusColor: "blue" },
    ];

    const publicState = toPublicState(state);
    expect(publicState.worldLevel).toBe(3);
    expect(publicState.cityLevel).toBe(3);
    expect(publicState.intersections.find((intersection) => intersection.id === cityId)?.cityStack).toEqual([
      { playerId: "player-1", playerColor: "#d73a31", level: 1 },
    ]);
  });

  it("produces city level times area level per colored connection and ignores neutral areas", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const intersection = state.intersections.find((candidate) => candidate.adjacentAreaIds.length === 3)!;
    state.intersections.find((candidate) => candidate.id === intersection.id)!.cityStack = [
      { playerId: "player-1" },
      { playerId: "player-1" },
    ];
    const [redArea, blueArea, neutralArea] = intersection.adjacentAreaIds;
    addBoardCubes(state, redArea, { red: 4 });
    addBoardCubes(state, blueArea, { blue: 5 });
    addBoardCubes(state, neutralArea, { red: 1, blue: 1 });
    addBoardCubes(state, "area-east", { yellow: 3 });
    expect(getWorldLevel(state)).toBe(1);

    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-production" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-production" }];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = endTurn(state);
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });
    state = endTurn(state);

    const production = state.lastProduction.find((entry) => entry.playerId === "player-1")!;
    expect(production.cubes).toEqual({ red: 6, blue: 9, yellow: 0 });
  });

  it("sums production from multiple cities", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const first = state.intersections.find((candidate) => candidate.adjacentAreaIds.includes("area-center"))!;
    const second = state.intersections.find(
      (candidate) => candidate.id !== first.id && candidate.adjacentAreaIds.includes("area-center")
    )!;
    first.cityStack = [{ playerId: "player-1" }];
    second.cityStack = [{ playerId: "player-1" }];
    addBoardCubes(state, "area-center", { yellow: 3 });
    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-production" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-production" }];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = endTurn(state);
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });
    state = endTurn(state);
    expect(state.lastProduction.find((entry) => entry.playerId === "player-1")?.cubes.yellow).toBe(4);
  });
});

describe("game end, invalid actions, and undo consistency", () => {
  it("ends after the third round and chooses tied winners by final contribution", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.round = 3;
    state.players[0].contribution = 2;
    state.players[1].contribution = 1;
    state.intersections[0].cityStack = [{ playerId: "player-2" }];
    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-production" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-production" }];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = endTurn(state);
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });
    state = endTurn(state);
    const publicState = toPublicState(state);
    expect(publicState.status).toBe("ended");
    expect(publicState.winners.map((winner) => winner.id)).toEqual(["player-1", "player-2"]);
  });

  it("rejects non-current and phase-invalid operations without partial mutation", () => {
    const state = createInitialState(["A", "B"]);
    const before = JSON.stringify(state);
    expect(
      applyAction(state, {
        type: "USE_CARD",
        playerId: "player-1",
        cardInstanceId: "missing",
        mode: "basic",
        basicColor: "red",
      }).ok
    ).toBe(false);
    expect(
      applyAction(state, {
        type: "DRAFT_PICK",
        playerId: "player-2",
        cardInstanceId: state.draftPacks[1][0].instanceId,
      }).ok
    ).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects ending a turn before using one card and rejects a second card in the same turn", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    expect(applyAction(state, { type: "END_TURN", playerId: "player-1" }).ok).toBe(false);
    const firstCard = state.players[0].handCards[0];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: firstCard.instanceId,
      mode: "basic",
      basicColor: "red",
    });
    const secondCard = state.players[0].handCards[0];
    expect(
      applyAction(state, {
        type: "USE_CARD",
        playerId: "player-1",
        cardInstanceId: secondCard.instanceId,
        mode: "basic",
        basicColor: "blue",
      }).ok
    ).toBe(false);
  });

  it("can restore a previous snapshot for undo across card, cubes, cities, contribution and world level", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes = { red: 3, blue: 1, yellow: 1 };
    const snapshot = structuredClone(state) as GameState;
    const cityId = emptyIntersectionIds(state, 1)[0];
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    const card = cardOfType(state, 0, "red-production");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    state = endTurn(state, { areaId: "area-center", color: "red" });
    expect(getWorldLevel(state)).toBe(1);
    expect(state.areas.find((area) => area.id === "area-center")?.cubes.red).toBe(1);
    expect(snapshot.players[0].handCards.length).toBe(8);
    expect(snapshot.players[0].cubes).toEqual({ red: 3, blue: 1, yellow: 1 });
    expect(snapshot.intersections.every((intersection) => intersection.cityStack.length === 0)).toBe(true);
    expect(snapshot).toEqual(structuredClone(snapshot));
  });
});
