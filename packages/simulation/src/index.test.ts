import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  type GameState,
} from "@sdb/game-core";
import { type CardType, type GameAction } from "@sdb/protocol";
import { SeededRng } from "./rng";
import { selectRandomAgentAction } from "./random-agent";
import { simulateGame, simulateGames } from "./runner";
import { writeSimulationRun } from "./output";
import { createReplayLog, expandReplayLog } from "./replay-delta";
import { simulationSchemaVersion, type ReplayStep } from "./types";

const play = (state: GameState, action: GameAction): GameState => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

const actionStateWithCard = (cardType: CardType): GameState => {
  const state = createInitialState(["A", "B"]);
  state.phase = "action";
  state.draftPacks = [];
  state.currentPlayerIndex = 0;
  state.turnCardUsed = false;
  state.players[0].handCards = [{ instanceId: `test-${cardType}`, type: cardType }];
  state.players[1].handCards = [];
  return state;
};

const useOnlyCard = (state: GameState): GameState => {
  const card = state.players[state.currentPlayerIndex].handCards[0];
  return play(state, {
    type: "USE_CARD",
    playerId: state.players[state.currentPlayerIndex].id,
    cardInstanceId: card.instanceId,
    mode: "production",
  });
};

const expectSelectedActionIsLegal = (state: GameState, seed: string): GameAction => {
  const action = selectRandomAgentAction(state, new SeededRng(seed));
  expect(action).not.toBeNull();
  const result = applyAction(state, action!);
  expect(result.ok).toBe(true);
  return action!;
};

describe("seeded RNG", () => {
  it("returns the same sequence for the same seed", () => {
    const first = new SeededRng("same-seed");
    const second = new SeededRng("same-seed");
    expect(Array.from({ length: 8 }, () => first.nextUint32())).toEqual(
      Array.from({ length: 8 }, () => second.nextUint32())
    );
  });

  it("returns different sequences for different seeds", () => {
    const first = new SeededRng("seed-a");
    const second = new SeededRng("seed-b");
    expect(Array.from({ length: 8 }, () => first.nextUint32())).not.toEqual(
      Array.from({ length: 8 }, () => second.nextUint32())
    );
  });
});

describe("random agent", () => {
  it("drafts a legal card", () => {
    const state = createInitialState(["A", "B"]);
    const action = expectSelectedActionIsLegal(state, "draft");
    expect(action.type).toBe("DRAFT_PICK");
  });

  it("uses cards with a legal mode and never scores a card without scoring use", () => {
    for (const cardType of [
      "red-production",
      "blue-production",
      "yellow-production",
      "tricolor-city",
      "neutral-development",
    ] as const) {
      const action = expectSelectedActionIsLegal(actionStateWithCard(cardType), `card-${cardType}`);
      expect(action.type).toBe("USE_CARD");
      if (
        action.type === "USE_CARD" &&
        (cardType === "tricolor-city" || cardType === "neutral-development")
      ) {
        expect(action.mode).not.toBe("scoring");
      }
    }
  });

  it("resolves normal turn-end development legally", () => {
    let state = actionStateWithCard("red-production");
    state = useOnlyCard(state);
    const action = expectSelectedActionIsLegal(state, "normal-development");
    expect(action.type).toBe("END_TURN");
  });

  it("resolves tricolor-city development legally", () => {
    let state = actionStateWithCard("tricolor-city");
    state.players[0].cubes = { red: 1, blue: 1, yellow: 0 };
    state = useOnlyCard(state);
    const action = expectSelectedActionIsLegal(state, "tricolor-development");
    expect(action.type).toBe("END_TURN");
  });

  it("resolves neutral-development and optional bonus cubes legally", () => {
    let state = actionStateWithCard("neutral-development");
    state.players[0].cubes = { red: 1, blue: 1, yellow: 0 };
    state = useOnlyCard(state);
    const action = expectSelectedActionIsLegal(state, "neutral-development");
    expect(action.type).toBe("END_TURN");
  });

  it("resolves world level unlock bonuses legally", () => {
    const state = actionStateWithCard("red-production");
    state.turnCardUsed = true;
    state.players[0].handCards = [];
    state.worldLevel = 2;
    state.worldLevelUnlocks = [{ level: 2, playerId: "player-1", bonusColor: null }];
    state.pendingWorldLevelBonuses = [{ level: 2, playerId: "player-1" }];
    const action = expectSelectedActionIsLegal(state, "world-bonus");
    expect(action.type).toBe("CLAIM_WORLD_LEVEL_BONUS");
  });

  it("does not choose an invalid city build", () => {
    const state = actionStateWithCard("red-production");
    state.players[0].cubes = { red: 0, blue: 0, yellow: 0 };
    const action = expectSelectedActionIsLegal(state, "no-city");
    expect(action.type).not.toBe("BUILD_CITY");
  });
});

describe("headless runner", () => {
  it("replays the same final result and event snapshots for the same game seed", () => {
    const first = simulateGame({ gameId: "game-1", gameSeed: "fixed", playerCount: 4 });
    const second = simulateGame({ gameId: "game-1", gameSeed: "fixed", playerCount: 4 });
    expect(first).toEqual(second);
    expect(first.status).toBe("completed");
    expect(first.replay.length).toBeGreaterThan(0);
  });

  it("completes 2-player and 4-player games", () => {
    expect(simulateGame({ gameId: "two", gameSeed: "two", playerCount: 2 }).status).toBe("completed");
    expect(simulateGame({ gameId: "four", gameSeed: "four", playerCount: 4 }).status).toBe("completed");
  });

  it("runs multiple games and records each derived game seed", () => {
    const records = simulateGames("run-seed", 3, 2);
    expect(records).toHaveLength(3);
    expect(records.every((record) => record.status === "completed")).toBe(true);
    expect(new Set(records.map((record) => record.gameSeed)).size).toBe(3);
  });

  it("records safety-limit failures without marking them completed", () => {
    const record = simulateGame({
      gameId: "limited",
      gameSeed: "limited",
      playerCount: 2,
      maxDecisions: 1,
    });
    expect(record.status).toBe("failed");
    if (record.status === "failed") {
      expect(record.failure.reason).toContain("Exceeded max decisions");
    }
  });

  it("records required replay event types and final output fields", () => {
    const record = simulateGame({ gameId: "coverage", gameSeed: "coverage", playerCount: 4 });
    expect(record.status).toBe("completed");
    if (record.status !== "completed") return;
    const eventTypes = new Set(record.replay.map((step) => step.eventType));
    for (const eventType of [
      "game_start",
      "draft_pick",
      "card_use",
      "city_build",
      "turn_end_development",
      "special_development",
      "city_production",
      "round_start",
      "round_end",
      "game_end",
    ] as const) {
      expect(eventTypes.has(eventType)).toBe(true);
    }
    expect(record.finalScores).toHaveLength(4);
    expect(record.finalBoard).toHaveLength(7);
    expect(record.finalCityStacks.length).toBeGreaterThan(0);
    expect(record.replay.every((step) => step.snapshot.players && step.snapshot.areas)).toBe(true);
  });

  it("restores replay snapshots exactly from initial snapshot and deltas", () => {
    const record = simulateGame({ gameId: "delta", gameSeed: "delta", playerCount: 4 });
    const replayLog = createReplayLog(record.gameId, record.gameSeed, record.replay, simulationSchemaVersion);
    expect(expandReplayLog(replayLog.header, replayLog.steps)).toEqual(record.replay);
  });

  it("captures board, player, city, world, draft, and production changes in replay deltas", () => {
    const first = simulateGame({ gameId: "coverage", gameSeed: "coverage", playerCount: 4 }).replay[0];
    const secondSnapshot = structuredClone(first.snapshot);
    secondSnapshot.round = 2;
    secondSnapshot.worldLevel = 2;
    secondSnapshot.nextWorldLevelThreshold = 30;
    secondSnapshot.pendingWorldLevelBonus = { level: 2, playerId: "player-1", playerName: "Player 1" };
    secondSnapshot.players[0].cubes.red += 1;
    secondSnapshot.players[0].contribution += 3;
    secondSnapshot.players[0].finalScore += 3;
    secondSnapshot.players[0].handCards = [
      {
        instanceId: "red-1",
        type: "red-production",
        name: "赤の生産",
        color: "red",
        actionText: "",
        scoringText: "",
      },
    ];
    secondSnapshot.areas[0].cubes.red += 2;
    secondSnapshot.areas[0].cubeTotal += 2;
    secondSnapshot.areas[0].areaColor = "red";
    secondSnapshot.areas[0].areaLevel = 1;
    secondSnapshot.intersections[0].cityStack = [{ playerId: "player-1", playerColor: "#d73a31", level: 1 }];
    secondSnapshot.draftPacks = [
      [
        {
          instanceId: "blue-1",
          type: "blue-production",
          name: "青の生産",
          color: "blue",
          actionText: "",
          scoringText: "",
        },
      ],
    ];
    secondSnapshot.turnEndProduction = { color: "red", additionalCubes: 2 };
    secondSnapshot.turnEndDevelopment = {
      type: "neutral-development",
      maxPlacements: 2,
      placementRule: "same-area",
    };
    secondSnapshot.lastProduction = [
      {
        playerId: "player-1",
        playerName: "Player 1",
        cubes: { red: 2, blue: 0, yellow: 0 },
      },
    ];
    secondSnapshot.winners = [secondSnapshot.players[0]];

    const replay: ReplayStep[] = [
      first,
      {
        ...first,
        step: 1,
        eventType: "turn_end_development",
        round: 2,
        details: { placed: { areaId: secondSnapshot.areas[0].id, color: "red" } },
        snapshot: secondSnapshot,
      },
    ];
    const replayLog = createReplayLog("synthetic", "synthetic-seed", replay, simulationSchemaVersion);
    expect(replayLog.steps[1].stateDelta.length).toBeGreaterThan(0);
    expect(expandReplayLog(replayLog.header, replayLog.steps)).toEqual(replay);
  });
});

describe("simulation output", () => {
  it("writes metadata.json, games.jsonl, and summary.json", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "sdb-simulation-"));
    const { runDirectory, metadata } = await writeSimulationRun({
      games: 2,
      players: 2,
      seed: "output-seed",
      outputDirectory,
    });
    const metadataJson = JSON.parse(await readFile(join(runDirectory, "metadata.json"), "utf8"));
    const gameLines = (await readFile(join(runDirectory, "games.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const summaryJson = JSON.parse(await readFile(join(runDirectory, "summary.json"), "utf8"));

    expect(metadataJson.runSeed).toBe("output-seed");
    expect(metadataJson.completedGames).toBe(metadata.completedGames);
    expect(gameLines).toHaveLength(2);
    expect(gameLines[0].gameSeed).toContain("output-seed:game-1");
    expect(gameLines[0].status).toBe("completed");
    expect(gameLines[0].replay).toBeUndefined();
    expect(gameLines[0].replayFile).toBe("replays/game-000001.jsonl");
    expect(gameLines[0].replayStepCount).toBeGreaterThan(0);
    await expect(stat(join(runDirectory, "replays", "game-000001.jsonl"))).resolves.toBeDefined();
    expect(summaryJson.completedGames).toBe(2);
    expect(summaryJson.failedGames).toBe(0);
  });
});
