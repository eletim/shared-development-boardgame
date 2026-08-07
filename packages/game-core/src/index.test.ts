import { describe, expect, it } from "vitest";
import {
  applyAction,
  createBoardDefinition,
  createInitialState,
  getAreaCapacity,
  getAreaColor,
  getPhase,
  getPlacementLimit,
  toPublicState,
  validateCubeTotals,
  type GameState,
} from "./index";
import { type CardKind, type CubeColor, cubeColors, type GameAction } from "@sdb/protocol";

const activate = (state = createInitialState(["A", "B"])) => {
  state.status = "active";
  state.draft = null;
  state.currentPlayerIndex = 0;
  return state;
};

const play = (state: GameState, action: GameAction): GameState => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

const currentId = (state: GameState): string => state.players[state.currentPlayerIndex].id;

const addCard = (state: GameState, playerIndex: number, kind: CardKind, id = `${kind}-test`) => {
  state.players[playerIndex].cards.push({ id, kind });
  return id;
};

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
  it("generates seven areas and deduplicated shared intersections", () => {
    const board = createBoardDefinition();
    expect(board.areas).toHaveLength(7);
    expect(board.intersections).toHaveLength(24);
    expect(board.intersections.filter((intersection) => intersection.adjacentAreaIds.length === 3)).toHaveLength(6);
    expect(
      board.intersections.some(
        (intersection) =>
          intersection.adjacentAreaIds.join(",") ===
          "area-center,area-northeast,area-northwest"
      )
    ).toBe(true);
  });
});

describe("area color", () => {
  it("uses tie-loses color judgment", () => {
    expect(getAreaColor({ red: 2, blue: 2, yellow: 1 })).toBe("yellow");
    expect(getAreaColor({ red: 1, blue: 1, yellow: 0 })).toBe("neutral");
    expect(getAreaColor({ red: 2, blue: 2, yellow: 2 })).toBe("neutral");
    expect(getAreaColor({ red: 3, blue: 2, yellow: 1 })).toBe("red");
  });

  it("updates public area color from current cubes", () => {
    const state = activate();
    addBoardCubes(state, "area-center", { red: 2, blue: 2, yellow: 1 });
    expect(toPublicState(state).areas.find((area) => area.id === "area-center")?.areaColor).toBe("yellow");
    state.areas.find((area) => area.id === "area-center")!.cubes.yellow += 1;
    state.supply.yellow -= 1;
    expect(toPublicState(state).areas.find((area) => area.id === "area-center")?.areaColor).toBe("neutral");
  });
});

describe("draft", () => {
  it("passes remaining cards and keeps picked cards with each player", () => {
    let state = createInitialState(["A", "B"]);
    const firstPackCard = state.draft!.packs[0][0];
    const secondPackCard = state.draft!.packs[1][0];
    state = play(state, { type: "DRAFT_PICK", playerId: "player-1", cardId: firstPackCard.id });
    state = play(state, { type: "DRAFT_PICK", playerId: "player-2", cardId: secondPackCard.id });
    expect(state.draft?.round).toBe(2);
    expect(state.players[0].cards).toEqual([firstPackCard]);
    expect(state.players[1].cards).toEqual([secondPackCard]);
    expect(state.draft?.packs[0].some((card) => card.kind === "blue-development")).toBe(true);
  });

  it("moves to active play after every player has drafted four cards", () => {
    let state = createInitialState(["A", "B", "C"]);
    while (state.status === "draft") {
      const card = state.draft!.packs[state.draft!.currentPlayerIndex][0];
      state = play(state, { type: "DRAFT_PICK", playerId: currentId(state), cardId: card.id });
    }
    expect(state.status).toBe("active");
    expect(state.players.every((player) => player.cards.length === 4)).toBe(true);
  });
});

describe("cube and city rules", () => {
  it("preserves every color total at 15 through valid actions", () => {
    let state = activate();
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

  it("supports color card extra take and discards the card", () => {
    const state = activate();
    const cardId = addCard(state, 0, "red-development");
    const next = play(state, {
      type: "TAKE_CUBES",
      playerId: "player-1",
      cubes: { red: 1, blue: 1, yellow: 1 },
      accelerateCardId: cardId,
    });
    expect(next.players[0].hand).toEqual({ red: 2, blue: 1, yellow: 1 });
    expect(next.players[0].cards).toHaveLength(0);
    expect(next.players[0].usedCards[0].id).toBe(cardId);
  });

  it("changes capacity by phase", () => {
    const state = activate();
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

  it("adds one placement slot only for areas adjacent to the player's city", () => {
    const state = activate();
    const intersection = buildableIntersection(state);
    intersection.city = { playerId: "player-1" };
    const bonusAreaId = intersection.adjacentAreaIds[0];
    const outsideAreaId = state.areas.find((area) => !intersection.adjacentAreaIds.includes(area.id))!.id;
    expect(getPlacementLimit(state, "player-1", bonusAreaId)).toBe(4);
    expect(getPlacementLimit(state, "player-1", outsideAreaId)).toBe(3);
    intersection.city = { playerId: "player-1" };
    state.intersections.find(
      (candidate) => candidate !== intersection && candidate.adjacentAreaIds.includes(bonusAreaId)
    )!.city = { playerId: "player-1" };
    expect(getPlacementLimit(state, "player-1", bonusAreaId)).toBe(4);
  });

  it("stacks focused development with city placement bonus", () => {
    const state = activate();
    const areaId = buildableIntersection(state).adjacentAreaIds[0];
    const bonusIntersection = state.intersections.find((intersection) =>
      intersection.adjacentAreaIds.includes(areaId)
    )!;
    bonusIntersection.city = {
      playerId: "player-1",
    };
    state.intersections
      .filter((intersection) => !intersection.city)
      .slice(0, 3)
      .forEach((intersection) => {
        intersection.city = { playerId: "player-2" };
      });
    state.players[0].hand = { red: 5, blue: 0, yellow: 0 };
    const cardId = addCard(state, 0, "focused-development");
    const next = play(state, {
      type: "PLACE_CUBES",
      playerId: "player-1",
      areaId,
      cubes: { red: 5 },
      accelerateCardId: cardId,
    });
    expect(next.areas.find((area) => area.id === areaId)?.cubes.red).toBe(5);
  });

  it("moves one cube with redevelopment and respects destination capacity", () => {
    const state = activate();
    state.players[0].hand = { red: 1, blue: 0, yellow: 0 };
    addBoardCubes(state, "area-center", { blue: 1 });
    const cardId = addCard(state, 0, "redevelopment");
    const next = play(state, {
      type: "PLACE_CUBES",
      playerId: "player-1",
      areaId: "area-east",
      cubes: { red: 1 },
      accelerateCardId: cardId,
      redevelopmentMove: { color: "blue", fromAreaId: "area-center", toAreaId: "area-east" },
    });
    expect(next.areas.find((area) => area.id === "area-center")?.cubes.blue).toBe(0);
    expect(next.areas.find((area) => area.id === "area-east")?.cubes).toMatchObject({ red: 1, blue: 1 });

    const blocked = activate();
    blocked.players[0].hand = { red: 1, blue: 0, yellow: 0 };
    addBoardCubes(blocked, "area-center", { blue: 1 });
    addBoardCubes(blocked, "area-east", { red: 3 });
    const blockedCardId = addCard(blocked, 0, "redevelopment");
    expect(
      applyAction(blocked, {
        type: "PLACE_CUBES",
        playerId: "player-1",
        areaId: "area-east",
        cubes: { red: 1 },
        accelerateCardId: blockedCardId,
        redevelopmentMove: { color: "blue", fromAreaId: "area-center", toAreaId: "area-east" },
      }).ok
    ).toBe(false);
  });

  it("keeps full areas placeable in legal info when redevelopment could free space first", () => {
    const state = activate();
    state.players[0].hand = { red: 1, blue: 0, yellow: 0 };
    addBoardCubes(state, "area-center", { red: 1, blue: 1, yellow: 1 });
    addCard(state, 0, "redevelopment");
    expect(toPublicState(state).legal.placeableAreaIds).toContain("area-center");
  });

  it("builds a city with urbanization waiving one color", () => {
    const state = activate();
    const intersection = buildableIntersection(state);
    const [areaId] = intersection.adjacentAreaIds;
    addBoardCubes(state, areaId, { red: 1, blue: 1 });
    const cardId = addCard(state, 0, "urbanization");
    const next = play(state, {
      type: "BUILD_CITY",
      playerId: "player-1",
      intersectionId: intersection.id,
      payment: { red: areaId, blue: areaId },
      accelerateCardId: cardId,
      waivedColor: "yellow",
    });
    expect(next.intersections.find((candidate) => candidate.id === intersection.id)?.city).toEqual({
      playerId: "player-1",
    });
  });
});

describe("scoring, end game and undo", () => {
  it("scores cards from current board and consumes a turn", () => {
    const state = activate();
    addBoardCubes(state, "area-center", { red: 3 });
    addBoardCubes(state, "area-east", { red: 2, blue: 2, yellow: 1 });
    const cardId = addCard(state, 0, "red-development");
    const next = play(state, { type: "SCORE_CARD", playerId: "player-1", cardId });
    expect(next.players[0].scoreFromCards).toBe(1);
    expect(next.players[0].turnsTaken).toBe(1);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it("scores neutral and city cards and rejects using the same card twice", () => {
    const state = activate();
    addBoardCubes(state, "area-center", { red: 1, blue: 1 });
    const cardId = addCard(state, 0, "redevelopment");
    const next = play(state, { type: "SCORE_CARD", playerId: "player-1", cardId });
    expect(next.players[0].scoreFromCards).toBeGreaterThan(0);
    expect(
      applyAction(next, { type: "SCORE_CARD", playerId: "player-2", cardId }).ok
    ).toBe(false);
  });

  it("ends after every player takes twelve active turns and ranks by contribution", () => {
    let state = activate(createInitialState(["A", "B", "C"]));
    state.players[0].scoreFromCards = 2;
    state.players[1].scoreFromCards = 3;
    state.intersections[0].city = { playerId: "player-1" };
    for (let index = 0; index < 36; index += 1) {
      state = play(state, { type: "PASS", playerId: currentId(state) });
    }
    expect(state.status).toBe("ended");
    expect(state.players.every((player) => player.turnsTaken === 12)).toBe(true);
    expect(toPublicState(state).winners.map((winner) => winner.id)).toEqual(["player-1", "player-2"]);
  });

  it("rejects non-current player actions and invalid actions do not mutate input state", () => {
    const state = activate();
    expect(applyAction(state, { type: "PASS", playerId: "player-2" }).ok).toBe(false);
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
});
