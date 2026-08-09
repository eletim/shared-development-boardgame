import Fastify, { type FastifyInstance } from "fastify";
import {
  applyAction,
  createInitialState,
  type GameState,
  toPublicState,
} from "@sdb/game-core";
import {
  cubeColors,
  type CardUseMode,
  type CubeColor,
  type GameAction,
  type GameResponse,
} from "@sdb/protocol";

type Session = {
  state: GameState | null;
  undoStack: GameState[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeNames = (body: unknown): string[] | null => {
  if (!isRecord(body) || !Array.isArray(body.playerNames)) return null;
  const names = body.playerNames
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return names.length >= 2 && names.length <= 4 ? names : null;
};

const isCubeColor = (value: unknown): value is CubeColor =>
  typeof value === "string" && cubeColors.includes(value as CubeColor);

const parseAction = (value: unknown): GameAction | null => {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.playerId !== "string") {
    return null;
  }

  if (value.type === "DRAFT_PICK" && typeof value.cardInstanceId === "string") {
    return {
      type: value.type,
      playerId: value.playerId,
      cardInstanceId: value.cardInstanceId,
    };
  }

  if (
    value.type === "USE_CARD" &&
    typeof value.cardInstanceId === "string" &&
    typeof value.mode === "string" &&
    ["production", "scoring", "basic"].includes(value.mode)
  ) {
    const action: Extract<GameAction, { type: "USE_CARD" }> = {
      type: value.type,
      playerId: value.playerId,
      cardInstanceId: value.cardInstanceId,
      mode: value.mode as CardUseMode,
    };
    if (isCubeColor(value.basicColor)) action.basicColor = value.basicColor;
    return action;
  }

  if (value.type === "BUILD_CITY" && typeof value.intersectionId === "string") {
    return {
      type: value.type,
      playerId: value.playerId,
      intersectionId: value.intersectionId,
    };
  }

  if (value.type === "END_TURN") {
    const action: Extract<GameAction, { type: "END_TURN" }> = {
      type: value.type,
      playerId: value.playerId,
    };
    if (value.placement !== undefined) {
      if (
        !isRecord(value.placement) ||
        typeof value.placement.areaId !== "string" ||
        !isCubeColor(value.placement.color)
      ) {
        return null;
      }
      action.placement = {
        areaId: value.placement.areaId,
        color: value.placement.color,
      };
    }
    return action;
  }

  if (value.type === "CLAIM_WORLD_LEVEL_BONUS" && isCubeColor(value.color)) {
    return {
      type: value.type,
      playerId: value.playerId,
      color: value.color,
    };
  }

  return null;
};

const publicResponse = (session: Session): GameResponse => ({
  state: session.state ? toPublicState(session.state, session.undoStack.length > 0) : null,
});

export const createServer = (): FastifyInstance => {
  const server = Fastify({ logger: false });
  const session: Session = { state: null, undoStack: [] };

  server.get("/api/health", async () => ({ ok: true }));

  server.get("/api/game", async () => publicResponse(session));

  server.post("/api/game/start", async (request, reply) => {
    const names = normalizeNames(request.body);
    if (!names) {
      return reply.code(400).send({ state: null, error: "プレイヤーは2〜4人、表示名は必須です。" });
    }
    try {
      session.state = createInitialState(names);
      session.undoStack = [];
      return publicResponse(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ゲーム開始に失敗しました。";
      return reply.code(400).send({ state: null, error: message });
    }
  });

  server.post("/api/game/actions", async (request, reply) => {
    if (!session.state) {
      return reply.code(400).send({ state: null, error: "ゲームが開始されていません。" });
    }
    const body = isRecord(request.body) ? request.body : {};
    const action = parseAction(body.action);
    if (!action) {
      return reply.code(400).send({
        state: toPublicState(session.state, session.undoStack.length > 0),
        error: "アクション入力が不正です。",
      });
    }

    const previous = session.state;
    const result = applyAction(session.state, action);
    if (!result.ok) {
      return reply.code(400).send({
        state: toPublicState(result.state, session.undoStack.length > 0),
        error: result.error,
      });
    }
    session.undoStack.push(previous);
    session.state = result.state;
    return publicResponse(session);
  });

  server.post("/api/game/undo", async (request, reply) => {
    if (!session.state) {
      return reply.code(400).send({ state: null, error: "ゲームが開始されていません。" });
    }
    const previous = session.undoStack.pop();
    if (!previous) {
      return reply.code(400).send({
        state: toPublicState(session.state, false),
        error: "Undoできる履歴がありません。",
      });
    }
    session.state = previous;
    return publicResponse(session);
  });

  server.post("/api/game/reset", async (_request, reply) => {
    if (!session.state) {
      session.undoStack = [];
      return reply.send({ state: null });
    }
    const names = session.state.players.map((player) => player.name);
    session.state = createInitialState(names);
    session.undoStack = [];
    return publicResponse(session);
  });

  return server;
};

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createServer();
  server.listen({ host, port }).then((address) => {
    console.log(`Server listening at ${address}`);
  });
}
