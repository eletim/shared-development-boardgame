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

describe("server API", () => {
  beforeEach(async () => {
    server = createServer();
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("starts a game and returns public state", async () => {
    const response = await post("/api/game/start", { playerNames: ["A", "B"] });
    expect(response.statusCode).toBe(200);
    expect(response.json().state.players).toHaveLength(2);
  });

  it("rejects API calls before the game starts", async () => {
    const response = await post("/api/game/actions", {
      action: { type: "PASS", playerId: "player-1" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("開始");
  });

  it("applies a valid action and rejects a representative invalid action", async () => {
    await post("/api/game/start", { playerNames: ["A", "B"] });
    const valid = await post("/api/game/actions", {
      action: { type: "TAKE_CUBES", playerId: "player-1", cubes: { red: 1, blue: 1, yellow: 1 } },
    });
    expect(valid.statusCode).toBe(200);
    const invalid = await post("/api/game/actions", {
      action: { type: "TAKE_CUBES", playerId: "player-1", cubes: { red: 1, blue: 1, yellow: 1 } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().state.currentPlayerId).toBe("player-2");
  });

  it("supports reset and undo", async () => {
    await post("/api/game/start", { playerNames: ["A", "B"] });
    await post("/api/game/actions", {
      action: { type: "PASS", playerId: "player-1" },
    });
    const undone = await post("/api/game/undo");
    expect(undone.statusCode).toBe(200);
    expect(undone.json().state.currentPlayerId).toBe("player-1");
    const reset = await post("/api/game/reset");
    expect(reset.statusCode).toBe(200);
    expect(reset.json().state.round).toBe(1);
  });

  it("rejects actions after the game ended", async () => {
    await post("/api/game/start", { playerNames: ["A", "B"] });
    for (let index = 0; index < 24; index += 1) {
      const current = await server.inject({ method: "GET", url: "/api/game" });
      const playerId = current.json().state.currentPlayerId;
      await post("/api/game/actions", { action: { type: "PASS", playerId } });
    }
    const response = await post("/api/game/actions", {
      action: { type: "PASS", playerId: "player-1" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("終了");
  });
});
