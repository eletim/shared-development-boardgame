import { describe, expect, it } from "vitest";
import {
  applyAction,
  createBoardDefinition,
  createInitialState,
  getAreaCapacity,
  getPhase,
  toPublicState,
  validateCubeTotals,
  type GameState,
} from "./index";
import { type CubeColor, cubeColors, type GameAction } from "@sdb/protocol";

const play = (state: GameState, action: GameAction): GameState => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

const currentId = (state: GameState): string => state.players[state.currentPlayerIndex].id;

const addBoardCubes = (
  state: GameState,
  areaId: string,
  cubes: Partial<Record<CubeColor, number>>
) => {
  const area = state.areas.find((candidate) => candidate.id === areaId);
  if (!area) throw new Error(areaId);
  for (const color of cubeColors) {
    const amount = cubes[color] ?? 0;
    area.cubes[color] += amount;
    state.supply[color] -= amount;
  }
};

const buildableIntersection = (state: GameState) =>
  state.intersections.find((intersection) => intersection.adjacentAreaIds.length === 3)!;

describe("board definition", () => {
  it("generates seven areas", () => {
    expect(createBoardDefinition().areas).toHaveLength(7);
  });

  it("deduplicates shared intersections and keeps adjacent area ids", () => {
    const board = createBoardDefinition();
    expect(board.intersections).toHaveLength(24);
    expect(new Set(board.intersections.map((intersection) => intersection.id)).size).toBe(24);
    expect(board.intersections.some((intersection) => intersection.adjacentAreaIds.length === 3)).toBe(true);
    expect(
      board.intersections.every(
        (intersection) =>
          intersection.adjacentAreaIds.length >= 1 && intersection.adjacentAreaIds.length <= 3
      )
    ).toBe(true);
    expect(board.intersections.filter((intersection) => intersection.adjacentAreaIds.length === 3)).toHaveLength(6);
    expect(board.intersections.filter((intersection) => intersection.adjacentAreaIds.length === 2)).toHaveLength(6);
    expect(board.intersections.filter((intersection) => intersection.adjacentAreaIds.length === 1)).toHaveLength(12);
    expect(
      board.intersections.some(
        (intersection) =>
          intersection.adjacentAreaIds.join(",") ===
          "area-center,area-northeast,area-northwest"
      )
    ).toBe(true);
    expect(
      board.intersections.some(
        (intersection) =>
          intersection.adjacentAreaIds.join(",") === "area-center,area-east,area-northeast"
      )
    ).toBe(true);
  });
});

describe("cube rules", () => {
  it("preserves every color total at 15 through valid actions", () => {
    let state = createInitialState(["A", "B"]);
    state = play(state, {
      type: "TAKE_CUBES",
      playerId: "player-1",
      cubes: { red: 1, blue: 1, yellow: 1 },
    });
    state = play(state, {
      type: "TAKE_CUBES",
      playerId: "player-2",
      cubes: { red: 2 },
    });
    state = play(state, {
      type: "PLACE_CUBES",
      playerId: "player-1",
      areaId: "area-center",
      cubes: { red: 1, blue: 1, yellow: 1 },
    });
    expect(validateCubeTotals(state)).toBe(true);
  });

  it("takes one cube of each different color", () => {
    const state = play(createInitialState(["A", "B"]), {
      type: "TAKE_CUBES",
      playerId: "player-1",
      cubes: { red: 1, blue: 1, yellow: 1 },
    });
    expect(state.players[0].hand).toEqual({ red: 1, blue: 1, yellow: 1 });
    expect(state.supply).toEqual({ red: 14, blue: 14, yellow: 14 });
  });

  it("takes two same-color cubes only when supply has at least four", () => {
    const valid = applyAction(createInitialState(["A", "B"]), {
      type: "TAKE_CUBES",
      playerId: "player-1",
      cubes: { red: 2 },
    });
    expect(valid.ok).toBe(true);

    const state = createInitialState(["A", "B"]);
    state.supply.red = 3;
    const invalid = applyAction(state, {
      type: "TAKE_CUBES",
      playerId: "player-1",
      cubes: { red: 2 },
    });
    expect(invalid.ok).toBe(false);
  });

  it("rejects taking above the hand limit", () => {
    const state = createInitialState(["A", "B"]);
    state.players[0].hand = { red: 8, blue: 1, yellow: 0 };
    const result = applyAction(state, {
      type: "TAKE_CUBES",
      playerId: "player-1",
      cubes: { red: 1, blue: 1, yellow: 1 },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects placing cubes that are not in hand", () => {
    const result = applyAction(createInitialState(["A", "B"]), {
      type: "PLACE_CUBES",
      playerId: "player-1",
      areaId: "area-center",
      cubes: { red: 1 },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects placing zero or four cubes", () => {
    const state = createInitialState(["A", "B"]);
    state.players[0].hand = { red: 4, blue: 0, yellow: 0 };
    expect(
      applyAction(state, {
        type: "PLACE_CUBES",
        playerId: "player-1",
        areaId: "area-center",
        cubes: {},
      }).ok
    ).toBe(false);
    expect(
      applyAction(state, {
        type: "PLACE_CUBES",
        playerId: "player-1",
        areaId: "area-center",
        cubes: { red: 4 },
      }).ok
    ).toBe(false);
  });

  it("rejects placing above area capacity", () => {
    const state = createInitialState(["A", "B"]);
    state.players[0].hand = { red: 1, blue: 0, yellow: 0 };
    addBoardCubes(state, "area-center", { red: 3 });
    const result = applyAction(state, {
      type: "PLACE_CUBES",
      playerId: "player-1",
      areaId: "area-center",
      cubes: { red: 1 },
    });
    expect(result.ok).toBe(false);
  });
});

describe("city rules", () => {
  it("changes capacity by phase", () => {
    const state = createInitialState(["A", "B"]);
    expect(getPhase(state)).toBe(1);
    expect(getAreaCapacity(state)).toBe(3);
    for (let index = 0; index < 4; index += 1) {
      state.intersections[index].city = { playerId: "player-1" };
    }
    expect(getPhase(state)).toBe(2);
    expect(getAreaCapacity(state)).toBe(5);
    for (let index = 4; index < 8; index += 1) {
      state.intersections[index].city = { playerId: "player-1" };
    }
    expect(getPhase(state)).toBe(3);
    expect(getAreaCapacity(state)).toBe(7);
  });

  it("rejects payment from non-adjacent areas", () => {
    const state = createInitialState(["A", "B"]);
    const intersection = buildableIntersection(state);
    const [areaId] = intersection.adjacentAreaIds;
    addBoardCubes(state, areaId, { red: 1, blue: 1, yellow: 1 });
    const outsideArea = state.areas.find((area) => !intersection.adjacentAreaIds.includes(area.id))!;
    const result = applyAction(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: intersection.id,
      payment: { red: areaId, blue: areaId, yellow: outsideArea.id },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects building when red, blue and yellow are not available", () => {
    const state = createInitialState(["A", "B"]);
    const intersection = buildableIntersection(state);
    const [areaId] = intersection.adjacentAreaIds;
    addBoardCubes(state, areaId, { red: 1, blue: 1 });
    const result = applyAction(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: intersection.id,
      payment: { red: areaId, blue: areaId, yellow: areaId },
    });
    expect(result.ok).toBe(false);
  });

  it("returns building cubes to supply and places the current player's city", () => {
    const state = createInitialState(["A", "B"]);
    const intersection = buildableIntersection(state);
    const [areaId] = intersection.adjacentAreaIds;
    addBoardCubes(state, areaId, { red: 1, blue: 1, yellow: 1 });
    const result = applyAction(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: intersection.id,
      payment: { red: areaId, blue: areaId, yellow: areaId },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.supply).toEqual({ red: 15, blue: 15, yellow: 15 });
      expect(
        result.state.intersections.find((candidate) => candidate.id === intersection.id)?.city
      ).toEqual({ playerId: "player-1" });
    }
  });

  it("rejects building on an occupied intersection", () => {
    const state = createInitialState(["A", "B"]);
    const intersection = buildableIntersection(state);
    intersection.city = { playerId: "player-2" };
    const result = applyAction(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: intersection.id,
      payment: { red: "area-center", blue: "area-center", yellow: "area-center" },
    });
    expect(result.ok).toBe(false);
  });

  it("advances phase immediately after city thresholds", () => {
    const state = createInitialState(["A", "B"]);
    for (let index = 0; index < 3; index += 1) {
      state.intersections[index].city = { playerId: "player-2" };
    }
    const intersection = state.intersections.find(
      (candidate) => !candidate.city && candidate.adjacentAreaIds.length === 3
    )!;
    const [areaId] = intersection.adjacentAreaIds;
    addBoardCubes(state, areaId, { red: 1, blue: 1, yellow: 1 });
    const result = applyAction(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: intersection.id,
      payment: { red: areaId, blue: areaId, yellow: areaId },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(getPhase(result.state)).toBe(2);
  });
});

describe("turns, end game and undo", () => {
  it("advances turns and increments the round after all players acted", () => {
    let state = createInitialState(["A", "B"]);
    state = play(state, { type: "PASS", playerId: currentId(state) });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.round).toBe(1);
    state = play(state, { type: "PASS", playerId: currentId(state) });
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.round).toBe(2);
  });

  it("ends after every player takes twelve turns", () => {
    let state = createInitialState(["A", "B", "C"]);
    for (let index = 0; index < 36; index += 1) {
      state = play(state, { type: "PASS", playerId: currentId(state) });
    }
    expect(state.status).toBe("ended");
    expect(state.players.every((player) => player.turnsTaken === 12)).toBe(true);
  });

  it("detects single and tied winners by city count", () => {
    const state = createInitialState(["A", "B", "C"]);
    state.status = "ended";
    state.intersections[0].city = { playerId: "player-1" };
    state.intersections[1].city = { playerId: "player-2" };
    state.intersections[2].city = { playerId: "player-2" };
    expect(toPublicState(state).winners.map((winner) => winner.id)).toEqual(["player-2"]);
    state.intersections[3].city = { playerId: "player-1" };
    expect(toPublicState(state).winners.map((winner) => winner.id)).toEqual(["player-1", "player-2"]);
  });

  it("rejects non-current player actions", () => {
    const result = applyAction(createInitialState(["A", "B"]), {
      type: "PASS",
      playerId: "player-2",
    });
    expect(result.ok).toBe(false);
  });

  it("does not change state after invalid actions", () => {
    const state = createInitialState(["A", "B"]);
    const before = JSON.stringify(state);
    const result = applyAction(state, {
      type: "PLACE_CUBES",
      playerId: "player-1",
      areaId: "area-center",
      cubes: { red: 1 },
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("can restore a previous state snapshot for undo", () => {
    const state = createInitialState(["A", "B"]);
    const snapshot = structuredClone(state) as GameState;
    const next = play(state, { type: "PASS", playerId: "player-1" });
    expect(next.round).toBe(1);
    expect(snapshot).toEqual(createInitialState(["A", "B"]));
  });
});
