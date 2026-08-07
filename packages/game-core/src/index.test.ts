import { describe, expect, it } from "vitest";
import {
  applyAction,
  createBoardDefinition,
  createInitialState,
  getAreaCapacity,
  getAreaColor,
  getBoardCubeTotal,
  getCityLevel,
  getWorldLevel,
  getWorldLevelFromCubeTotal,
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
    .filter((intersection) => !intersection.city)
    .slice(0, count)
    .map((intersection) => intersection.id);

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

  it("derives world level, area capacity, and city level from board cube total", () => {
    expect(getWorldLevelFromCubeTotal(0)).toBe(1);
    expect(getWorldLevelFromCubeTotal(13)).toBe(1);
    expect(getWorldLevelFromCubeTotal(14)).toBe(2);
    expect(getWorldLevelFromCubeTotal(27)).toBe(2);
    expect(getWorldLevelFromCubeTotal(28)).toBe(3);

    const state = createInitialState(["A", "B"]);
    expect(getWorldLevel(state)).toBe(1);
    expect(getAreaCapacity(state)).toBe(3);
    expect(getCityLevel(state)).toBe(1);
    addBoardCubes(state, "area-center", { red: 14 });
    expect(getBoardCubeTotal(state)).toBe(14);
    expect(getWorldLevel(state)).toBe(2);
    expect(getAreaCapacity(state)).toBe(5);
    expect(getCityLevel(state)).toBe(2);
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
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("uses a color development card to place cubes as one turn", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes.red = 3;
    const card = cardOfType(state, 0, "red-development");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "development",
      areaId: "area-center",
      cubes: { red: 3 },
    });
    expect(state.players[0].cubes.red).toBe(0);
    expect(state.areas.find((area) => area.id === "area-center")?.cubes.red).toBe(3);
    expect(state.players[0].handCards).toHaveLength(7);
  });

  it("uses scoring actions without leaving persistent cards", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    addBoardCubes(state, "area-center", { red: 2 });
    addBoardCubes(state, "area-east", { red: 3 });
    const card = cardOfType(state, 0, "red-development");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "scoring",
    });
    expect(state.players[0].contribution).toBe(2);
    expect(state.players[0].handCards.some((candidate) => candidate.instanceId === card.instanceId)).toBe(false);
  });

  it("allows redevelopment placement into capacity freed by the move", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes.red = 1;
    addBoardCubes(state, "area-center", { red: 3 });
    const card = cardOfType(state, 0, "redevelopment");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "development",
      move: { fromAreaId: "area-center", toAreaId: "area-east", color: "red" },
      placements: [{ areaId: "area-center", cubes: { red: 1 } }],
    });
    expect(state.areas.find((area) => area.id === "area-center")?.cubes.red).toBe(3);
    expect(state.areas.find((area) => area.id === "area-east")?.cubes.red).toBe(1);
    expect(state.players[0].cubes.red).toBe(0);
  });

  it("ends a round when every player's hand is empty and starts production before the next draft", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-development" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-development" }];
    state.players[0].cubes = { red: 1, blue: 1, yellow: 1 };
    state.intersections[0].city = { playerId: "player-1" };
    addBoardCubes(state, state.intersections[0].adjacentAreaIds[0], { red: 2 });

    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });

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
    expect(state.intersections.filter((intersection) => intersection.city?.playerId === "player-1")).toHaveLength(1);
  });

  it("allows multiple city builds in the same turn while resources last", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes = { red: 2, blue: 2, yellow: 2 };
    const [first, second] = emptyIntersectionIds(state, 2);
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: first });
    expect(state.currentPlayerIndex).toBe(0);
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: second });
    expect(state.players[0].cubes).toEqual({ red: 0, blue: 0, yellow: 0 });
    expect(state.intersections.filter((intersection) => intersection.city?.playerId === "player-1")).toHaveLength(2);
  });

  it("produces cityLevel times adjacent colored areas and ignores neutral areas", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const intersection = state.intersections.find((candidate) => candidate.adjacentAreaIds.length === 3)!;
    state.intersections.find((candidate) => candidate.id === intersection.id)!.city = { playerId: "player-1" };
    const [redArea, blueArea, neutralArea] = intersection.adjacentAreaIds;
    addBoardCubes(state, redArea, { red: 5 });
    addBoardCubes(state, blueArea, { blue: 5 });
    addBoardCubes(state, neutralArea, { red: 1, blue: 1 });
    addBoardCubes(state, "area-east", { yellow: 3 });
    expect(getWorldLevel(state)).toBe(2);

    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-development" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-development" }];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });

    const production = state.lastProduction.find((entry) => entry.playerId === "player-1")!;
    expect(production.cubes).toEqual({ red: 2, blue: 2, yellow: 0 });
  });

  it("sums production from multiple cities", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    const first = state.intersections.find((candidate) => candidate.adjacentAreaIds.includes("area-center"))!;
    const second = state.intersections.find(
      (candidate) => candidate.id !== first.id && candidate.adjacentAreaIds.includes("area-center")
    )!;
    first.city = { playerId: "player-1" };
    second.city = { playerId: "player-1" };
    addBoardCubes(state, "area-center", { yellow: 3 });
    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-development" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-development" }];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });
    expect(state.lastProduction.find((entry) => entry.playerId === "player-1")?.cubes.yellow).toBe(2);
  });
});

describe("game end, invalid actions, and undo consistency", () => {
  it("ends after the third round and chooses tied winners by final contribution", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.round = 3;
    state.players[0].contribution = 2;
    state.players[1].contribution = 1;
    state.intersections[0].city = { playerId: "player-2" };
    state.players[0].handCards = [{ instanceId: "p1-final", type: "red-development" }];
    state.players[1].handCards = [{ instanceId: "p2-final", type: "blue-development" }];
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: "p1-final",
      mode: "basic",
      basicColor: "red",
    });
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-2",
      cardInstanceId: "p2-final",
      mode: "basic",
      basicColor: "blue",
    });
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

  it("can restore a previous snapshot for undo across card, cubes, cities, contribution and world level", () => {
    let state = draftAll(createInitialState(["A", "B"]));
    state.players[0].cubes = { red: 3, blue: 1, yellow: 1 };
    const snapshot = structuredClone(state) as GameState;
    const cityId = emptyIntersectionIds(state, 1)[0];
    state = play(state, { type: "BUILD_CITY", playerId: "player-1", intersectionId: cityId });
    const card = cardOfType(state, 0, "red-development");
    state = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "development",
      areaId: "area-center",
      cubes: { red: 2 },
    });
    expect(getWorldLevel(state)).toBe(1);
    expect(snapshot.players[0].handCards.length).toBe(8);
    expect(snapshot.players[0].cubes).toEqual({ red: 3, blue: 1, yellow: 1 });
    expect(snapshot.intersections.every((intersection) => !intersection.city)).toBe(true);
    expect(snapshot).toEqual(structuredClone(snapshot));
  });
});
