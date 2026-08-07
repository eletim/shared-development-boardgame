import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import { createServer } from "./index";

let server: FastifyInstance;

const post = async (url: string, payload: unknown = {}) =>
  await server.inject({
    method: "POST",
    url,
    payload: payload as any,
  });

const getState = async () => {
  const response = await server.inject({ method: "GET", url: "/api/game" });
  return response.json().state;
};

const draftAll = async () => {
  let state = await getState();
  while (state.phase === "draft") {
    const card = state.legal.draftPack[0];
    const response = await post("/api/game/actions", {
      action: {
        type: "DRAFT_PICK",
        playerId: state.currentPlayerId,
        cardInstanceId: card.instanceId,
      },
    });
    expect(response.statusCode).toBe(200);
    state = response.json().state;
  }
  return state;
};

describe("server API", () => {
  beforeEach(async () => {
    server = createServer();
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("starts a game and returns draft public state", async () => {
    const response = await post("/api/game/start", { playerNames: ["A", "B"] });
    expect(response.statusCode).toBe(200);
    const state = response.json().state;
    expect(state.players).toHaveLength(2);
    expect(state.phase).toBe("draft");
    expect(state.legal.draftPack).toHaveLength(8);
  });

  it("rejects API calls before the game starts", async () => {
    const response = await post("/api/game/actions", {
      action: { type: "DRAFT_PICK", playerId: "player-1", cardInstanceId: "missing" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("開始");
  });

  it("applies draft and card actions and rejects representative invalid input", async () => {
    await post("/api/game/start", { playerNames: ["A", "B"] });
    const actionState = await draftAll();
    const card = actionState.players[0].handCards[0];
    const valid = await post("/api/game/actions", {
      action: {
        type: "USE_CARD",
        playerId: "player-1",
        cardInstanceId: card.instanceId,
        mode: "basic",
        basicColor: "red",
      },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().state.currentPlayerId).toBe("player-1");
    expect(valid.json().state.turnCardUsed).toBe(true);
    expect(valid.json().state.legal.canEndTurn).toBe(true);

    const invalid = await post("/api/game/actions", {
      action: {
        type: "USE_CARD",
        playerId: "player-1",
        cardInstanceId: card.instanceId,
        mode: "basic",
        basicColor: "red",
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().state.currentPlayerId).toBe("player-1");

    const ended = await post("/api/game/actions", {
      action: {
        type: "END_TURN",
        playerId: "player-1",
        placement: { areaId: "area-center", color: "red" },
      },
    });
    expect(ended.statusCode).toBe(200);
    expect(ended.json().state.currentPlayerId).toBe("player-2");
    expect(ended.json().state.areas.find((area: any) => area.id === "area-center").cubes.red).toBe(1);
  });

  it("rejects removed multi-placement payloads on turn end", async () => {
    await post("/api/game/start", { playerNames: ["A", "B"] });
    const actionState = await draftAll();
    const card = actionState.players[0].handCards[0];
    await post("/api/game/actions", {
      action: {
        type: "USE_CARD",
        playerId: "player-1",
        cardInstanceId: card.instanceId,
        mode: "basic",
        basicColor: "red",
      },
    });
    const invalid = await post("/api/game/actions", {
      action: {
        type: "END_TURN",
        playerId: "player-1",
        placement: [
          { areaId: "area-center", color: "red" },
          { areaId: "area-east", color: "blue" },
        ],
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().state.currentPlayerId).toBe("player-1");
  });

  it("supports reset and undo", async () => {
    await post("/api/game/start", { playerNames: ["A", "B"] });
    const state = await getState();
    await post("/api/game/actions", {
      action: {
        type: "DRAFT_PICK",
        playerId: state.currentPlayerId,
        cardInstanceId: state.legal.draftPack[0].instanceId,
      },
    });
    const undone = await post("/api/game/undo");
    expect(undone.statusCode).toBe(200);
    expect(undone.json().state.currentPlayerId).toBe("player-1");
    expect(undone.json().state.legal.draftPack).toHaveLength(8);
    const reset = await post("/api/game/reset");
    expect(reset.statusCode).toBe(200);
    expect(reset.json().state.round).toBe(1);
    expect(reset.json().state.phase).toBe("draft");
  });

  it("rejects actions after the game ended", async () => {
    await post("/api/game/start", { playerNames: ["A", "B"] });
    let state = await draftAll();
    for (let guard = 0; guard < 120; guard += 1) {
      state = await getState();
      if (state.status === "ended") break;
      if (state.phase === "draft") {
        const card = state.legal.draftPack[0];
        await post("/api/game/actions", {
          action: { type: "DRAFT_PICK", playerId: state.currentPlayerId, cardInstanceId: card.instanceId },
        });
      } else {
        const current = state.players.find((player: any) => player.id === state.currentPlayerId);
        const card = current.handCards[0];
        await post("/api/game/actions", {
          action: {
            type: "USE_CARD",
            playerId: state.currentPlayerId,
            cardInstanceId: card.instanceId,
            mode: "basic",
            basicColor: "red",
          },
        });
        state = await getState();
        await post("/api/game/actions", {
          action: { type: "END_TURN", playerId: state.currentPlayerId },
        });
      }
    }
    state = await getState();
    expect(state.status).toBe("ended");
    const response = await post("/api/game/actions", {
      action: { type: "BUILD_CITY", playerId: "player-1", intersectionId: "intersection-01" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("終了");
  });
});
