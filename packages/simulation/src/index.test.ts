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
import {
  cardEvaluationTerminalStates,
  selectRuleBasedAgentAction,
  scoreCubeCount,
  scoreRuleBasedAction,
} from "./rule-based-agent";
import { createAgents, simulateGame, simulateGames } from "./runner";
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

const expectRuleBasedActionIsLegal = (state: GameState, seed: string): GameAction => {
  const action = selectRuleBasedAgentAction(state, new SeededRng(seed));
  expect(action).not.toBeNull();
  const result = applyAction(state, action!);
  expect(result.ok).toBe(true);
  return action!;
};

const scoreDelta = (before: GameState, after: GameState): number =>
  scoreRuleBasedAction(before, after, before.players[0].id, {
    type: "END_TURN",
    playerId: before.players[0].id,
  });

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

describe("rule-based agent", () => {
  it("scores cube marginal values as 10, 7, 4, then 2", () => {
    expect(scoreCubeCount(1) - scoreCubeCount(0)).toBe(10);
    expect(scoreCubeCount(2) - scoreCubeCount(1)).toBe(7);
    expect(scoreCubeCount(3) - scoreCubeCount(2)).toBe(4);
    expect(scoreCubeCount(4) - scoreCubeCount(3)).toBe(2);
    expect(scoreCubeCount(5) - scoreCubeCount(4)).toBe(2);
  });

  it("scores cube gains and spends symmetrically from before/after deltas", () => {
    const before = actionStateWithCard("red-production");
    const after = structuredClone(before);
    after.players[0].cubes.red = 2;
    expect(scoreDelta(before, after)).toBe(17);
    expect(scoreDelta(after, before)).toBe(-17);

    const spendBefore = structuredClone(before);
    const spendAfter = structuredClone(before);
    spendBefore.players[0].cubes.red = 3;
    spendAfter.players[0].cubes.red = 1;
    expect(scoreDelta(spendBefore, spendAfter)).toBe(-11);
  });

  it("adds city build value by adjacent area count", () => {
    const before = actionStateWithCard("red-production");
    const intersections = new Map(
      before.intersections.map((intersection) => [intersection.adjacentAreaIds.length, intersection])
    );
    for (const [adjacentAreaCount, expectedScore] of [
      [1, 20],
      [2, 50],
      [3, 80],
    ] as const) {
      const intersection = intersections.get(adjacentAreaCount);
      expect(intersection).toBeDefined();
      const after = structuredClone(before);
      after.intersections
        .find((candidate) => candidate.id === intersection!.id)!
        .cityStack.push({ playerId: "player-1" });
      expect(
        scoreRuleBasedAction(before, after, "player-1", {
          type: "BUILD_CITY",
          playerId: "player-1",
          intersectionId: intersection!.id,
        })
      ).toBe(expectedScore);
    }
  });

  it("adds area value for neutral coloring and same-color strengthening", () => {
    const beforeNeutral = actionStateWithCard("red-production");
    const centerCity = beforeNeutral.intersections.find((intersection) =>
      intersection.adjacentAreaIds.includes("area-center")
    );
    expect(centerCity).toBeDefined();
    centerCity!.cityStack.push({ playerId: "player-1" });
    const afterNeutral = structuredClone(beforeNeutral);
    afterNeutral.areas.find((area) => area.id === "area-center")!.cubes.red = 1;
    expect(scoreDelta(beforeNeutral, afterNeutral)).toBe(30);

    const beforeStrengthen = structuredClone(beforeNeutral);
    beforeStrengthen.areas.find((area) => area.id === "area-center")!.cubes.red = 1;
    beforeStrengthen.intersections
      .find((intersection) => intersection.id === centerCity!.id)!
      .cityStack.push({ playerId: "player-1" });
    const afterStrengthen = structuredClone(beforeStrengthen);
    afterStrengthen.areas.find((area) => area.id === "area-center")!.cubes.red = 2;
    expect(scoreDelta(beforeStrengthen, afterStrengthen)).toBe(18);
  });

  it("adds 20 points per contribution gained", () => {
    const before = actionStateWithCard("red-production");
    const after = structuredClone(before);
    after.players[0].contribution = 1;
    expect(scoreDelta(before, after)).toBe(20);
  });

  it("selects the maximum scoring legal action", () => {
    const state = actionStateWithCard("red-production");
    const intersection = state.intersections.find((candidate) =>
      candidate.adjacentAreaIds.includes("area-center")
    );
    expect(intersection).toBeDefined();
    intersection!.cityStack.push({ playerId: "player-1" });
    state.areas.find((area) => area.id === "area-center")!.cubes.red = 5;

    const action = expectRuleBasedActionIsLegal(state, "max-score");
    expect(action).toMatchObject({
      type: "USE_CARD",
      playerId: "player-1",
      mode: "scoring",
    });
  });

  it("evaluates basic color production after delayed turn-end production", () => {
    const state = actionStateWithCard("red-production");
    state.areas.find((area) => area.id === "area-center")!.cubes.red = 1;

    const action = expectRuleBasedActionIsLegal(state, "delayed-production");
    expect(action).toMatchObject({
      type: "USE_CARD",
      playerId: "player-1",
      mode: "production",
    });
  });

  it("evaluates tricolor-city special development and bonus at turn end", () => {
    const state = actionStateWithCard("tricolor-city");
    const intersection = state.intersections.find(
      (candidate) => candidate.adjacentAreaIds.length === 3
    );
    expect(intersection).toBeDefined();
    const [redAreaId, blueAreaId, yellowAreaId] = intersection!.adjacentAreaIds;
    state.players[0].cubes = { red: 1, blue: 1, yellow: 0 };
    state.areas.find((area) => area.id === yellowAreaId)!.cubes.yellow = 1;
    intersection!.cityStack.push({ playerId: "player-1" });

    const action = expectRuleBasedActionIsLegal(state, "tricolor-turn-end");
    expect(action).toMatchObject({
      type: "USE_CARD",
      playerId: "player-1",
      mode: "production",
    });

    const afterUse = play(state, action);
    const terminalStates = cardEvaluationTerminalStates(state, afterUse, "player-1");
    expect(
      terminalStates.some((terminal) => {
        const player = terminal.state.players.find((candidate) => candidate.id === "player-1");
        const redArea = terminal.state.areas.find((area) => area.id === redAreaId);
        const blueArea = terminal.state.areas.find((area) => area.id === blueAreaId);
        return (
          player !== undefined &&
          player.cubes.red >= 1 &&
          player.cubes.blue >= 1 &&
          player.cubes.yellow >= 1 &&
          redArea?.cubes.red === 1 &&
          blueArea?.cubes.blue === 1
        );
      })
    ).toBe(true);
  });

  it("evaluates neutral-development coloring and arbitrary color bonus at turn end", () => {
    const coloringState = actionStateWithCard("neutral-development");
    const centerCity = coloringState.intersections.find((intersection) =>
      intersection.adjacentAreaIds.includes("area-center")
    );
    expect(centerCity).toBeDefined();
    coloringState.players[0].cubes = { red: 2, blue: 0, yellow: 0 };
    centerCity!.cityStack.push({ playerId: "player-1" });
    const coloringCard = coloringState.players[0].handCards[0];
    const afterColoringUse = play(coloringState, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: coloringCard.instanceId,
      mode: "production",
    });
    const coloringTerminals = cardEvaluationTerminalStates(
      coloringState,
      afterColoringUse,
      "player-1"
    );
    expect(
      coloringTerminals.some((terminal) => {
        const center = terminal.state.areas.find((area) => area.id === "area-center");
        return (
          center?.cubes.red === 2 &&
          scoreRuleBasedAction(coloringState, terminal.state, "player-1", {
            type: "USE_CARD",
            playerId: "player-1",
            cardInstanceId: coloringCard.instanceId,
            mode: "production",
          }) > 0
        );
      })
    ).toBe(true);

    const bonusState = actionStateWithCard("neutral-development");
    bonusState.areas.find((area) => area.id === "area-center")!.cubes = {
      red: 1,
      blue: 1,
      yellow: 0,
    };
    for (const intersection of bonusState.intersections.filter((candidate) =>
      candidate.adjacentAreaIds.includes("area-center")
    ).slice(0, 3)) {
      intersection.cityStack.push({ playerId: "player-2" });
    }

    const bonusAction = expectRuleBasedActionIsLegal(bonusState, "neutral-bonus");
    expect(bonusAction).toMatchObject({
      type: "USE_CARD",
      playerId: "player-1",
      mode: "production",
    });

    const afterUse = play(bonusState, bonusAction);
    const terminalStates = cardEvaluationTerminalStates(bonusState, afterUse, "player-1");
    expect(
      terminalStates.some((terminal) => {
        const player = terminal.state.players.find((candidate) => candidate.id === "player-1");
        return player !== undefined && player.cubes.red + player.cubes.blue + player.cubes.yellow >= 3;
      })
    ).toBe(true);
  });

  it("does not include optional city builds in card evaluation continuations", () => {
    const state = actionStateWithCard("red-production");
    state.players[0].cubes = { red: 0, blue: 1, yellow: 1 };
    state.areas.find((area) => area.id === "area-center")!.cubes.red = 1;
    const card = state.players[0].handCards[0];
    const afterUse = play(state, {
      type: "USE_CARD",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      mode: "production",
    });
    expect(afterUse.players[0].cubes).toEqual({ red: 1, blue: 1, yellow: 1 });

    const terminalStates = cardEvaluationTerminalStates(state, afterUse, "player-1");
    expect(terminalStates.length).toBeGreaterThan(0);
    expect(
      terminalStates.every((terminal) =>
        terminal.actions.every((action) => action.type !== "BUILD_CITY")
      )
    ).toBe(true);
  });

  it("uses seeded RNG only for ties", () => {
    const state = createInitialState(["A", "B"]);
    const first = selectRuleBasedAgentAction(state, new SeededRng("tie-seed"));
    const second = selectRuleBasedAgentAction(state, new SeededRng("tie-seed"));
    expect(first).toEqual(second);
    expect(first?.type).toBe("DRAFT_PICK");
  });

  it("completes 2-player and 4-player games", () => {
    expect(
      simulateGame({
        gameId: "rule-two",
        gameSeed: "rule-two",
        playerCount: 2,
        agents: createAgents(2, "rule-based"),
      }).status
    ).toBe("completed");
    expect(
      simulateGame({
        gameId: "rule-four",
        gameSeed: "rule-four",
        playerCount: 4,
        agents: createAgents(4, "rule-based"),
      }).status
    ).toBe("completed");
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

  it("runs multiple rule-based games", () => {
    const records = simulateGames("rule-run-seed", 2, 2, "rule-based");
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.status === "completed")).toBe(true);
    expect(records.every((record) => record.agents["player-1"].type === "rule-based")).toBe(true);
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
    expect(metadataJson.agent).toBe("random");
    expect(metadataJson.completedGames).toBe(metadata.completedGames);
    expect(gameLines).toHaveLength(2);
    expect(gameLines[0].gameSeed).toContain("output-seed:game-1");
    expect(gameLines[0].status).toBe("completed");
    expect(gameLines[0].agents["player-1"].type).toBe("random");
    expect(gameLines[0].replay).toBeUndefined();
    expect(gameLines[0].replayFile).toBe("replays/game-000001.jsonl");
    expect(gameLines[0].replayStepCount).toBeGreaterThan(0);
    await expect(stat(join(runDirectory, "replays", "game-000001.jsonl"))).resolves.toBeDefined();
    expect(summaryJson.completedGames).toBe(2);
    expect(summaryJson.failedGames).toBe(0);
  });

  it("writes selected rule-based agent metadata", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "sdb-rule-simulation-"));
    const { runDirectory, metadata } = await writeSimulationRun({
      games: 1,
      players: 2,
      seed: "rule-output-seed",
      agent: "rule-based",
      outputDirectory,
    });
    const metadataJson = JSON.parse(await readFile(join(runDirectory, "metadata.json"), "utf8"));
    const gameLine = JSON.parse((await readFile(join(runDirectory, "games.jsonl"), "utf8")).trim());

    expect(metadata.agent).toBe("rule-based");
    expect(metadataJson.agent).toBe("rule-based");
    expect(metadataJson.agents["player-1"].type).toBe("rule-based");
    expect(gameLine.agents["player-1"].type).toBe("rule-based");
  });
});
