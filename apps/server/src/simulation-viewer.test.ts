import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { simulationSchemaVersion, type CompletedGameRecord, type GameRecord, type ReplaySnapshot, type SimulationMetadata, type SimulationSummary } from "@sdb/simulation";
import { analyzeSimulationRun, listSimulationRuns, loadSimulationGame, loadSimulationRun, SimulationDataError } from "./simulation-viewer";

let temporaryDirectories: string[] = [];

const baseSnapshot = (): ReplaySnapshot => ({
  status: "active",
  phase: "action",
  round: 1,
  maxRounds: 3,
  worldLevel: 1,
  cityLevel: 1,
  areaCapacity: 2,
  boardCubeTotal: 0,
  highestContribution: 0,
  nextWorldLevelThreshold: 15,
  pendingWorldLevelBonus: null,
  worldLevelUnlocks: [],
  currentPlayerId: "player-1",
  currentPlayerName: "Player 1",
  turnCardUsed: false,
  turnEndProduction: null,
  turnEndDevelopment: null,
  draftPickNumber: 1,
  players: [
    {
      id: "player-1",
      name: "Player 1",
      color: "#d73a31",
      cubes: { red: 1, blue: 0, yellow: 0 },
      cubeTotal: 1,
      cityCount: 1,
      contribution: 0,
      finalScore: 0,
      handCards: [],
    },
    {
      id: "player-2",
      name: "Player 2",
      color: "#1f6feb",
      cubes: { red: 0, blue: 1, yellow: 0 },
      cubeTotal: 1,
      cityCount: 1,
      contribution: 0,
      finalScore: 0,
      handCards: [],
    },
  ],
  areas: [
    {
      id: "area-center",
      label: "中央",
      q: 0,
      r: 0,
      x: 0,
      y: 0,
      cubes: { red: 0, blue: 0, yellow: 0 },
      cubeTotal: 0,
      areaLevel: 0,
      areaColor: "neutral",
    },
  ],
  intersections: [
    {
      id: "intersection-01",
      x: 0,
      y: 0,
      adjacentAreaIds: ["area-center"],
      city: null,
      cityStack: [],
    },
  ],
  lastProduction: [],
  winners: [],
  draftPacks: [],
});

const areas = (colors: Array<"red" | "blue" | "yellow" | "neutral">) =>
  colors.map((color, index) => ({
    id: `area-${index + 1}`,
    label: `A${index + 1}`,
    q: 0,
    r: 0,
    x: index * 10,
    y: 0,
    cubes: { red: color === "red" ? 1 : 0, blue: color === "blue" ? 1 : 0, yellow: color === "yellow" ? 1 : 0 },
    cubeTotal: color === "neutral" ? 0 : 1,
    areaLevel: (color === "neutral" ? 0 : 1) as 0 | 1,
    areaColor: color,
  }));

const completedGameOne = (): CompletedGameRecord => ({
  schemaVersion: simulationSchemaVersion,
  status: "completed",
  gameId: "game-000001",
  gameSeed: "seed-1",
  playerCount: 2,
  agents: {
    "player-1": { type: "random", name: "Random 1" },
    "player-2": { type: "random", name: "Random 2" },
  },
  finalScores: [
    { playerId: "player-1", agent: { type: "random", name: "Random 1" }, finalScore: 20, contribution: 17, cityCount: 2, rank: 1 },
    { playerId: "player-2", agent: { type: "random", name: "Random 2" }, finalScore: 10, contribution: 8, cityCount: 1, rank: 2 },
  ],
  rankings: [
    { playerId: "player-1", agent: { type: "random", name: "Random 1" }, finalScore: 20, contribution: 17, cityCount: 2, rank: 1 },
    { playerId: "player-2", agent: { type: "random", name: "Random 2" }, finalScore: 10, contribution: 8, cityCount: 1, rank: 2 },
  ],
  winners: ["player-1"],
  finalWorldLevel: 2,
  finalBoard: areas(["red", "blue", "yellow", "neutral", "neutral", "red", "blue"]),
  finalCityStacks: [
    {
      id: "intersection-01",
      x: 0,
      y: 0,
      adjacentAreaIds: [],
      city: null,
      cityStack: [
        { playerId: "player-1", playerColor: "#d73a31", level: 1 },
        { playerId: "player-2", playerColor: "#1f6feb", level: 2 },
      ],
    },
    {
      id: "intersection-02",
      x: 1,
      y: 0,
      adjacentAreaIds: [],
      city: null,
      cityStack: [{ playerId: "player-1", playerColor: "#d73a31", level: 1 }],
    },
  ],
  stats: {
    worldLevelUnlocks: [{ level: 2, step: 5, round: 2, playerId: "player-1" }],
    draftedCards: { "red-production": 1, "blue-production": 0, "yellow-production": 0, "tricolor-city": 1, "neutral-development": 1 },
    usedCards: { "red-production": 2, "blue-production": 0, "yellow-production": 0, "tricolor-city": 1, "neutral-development": 1 },
    cardUseModes: { production: 3, scoring: 1, basic: 0 },
    tricolorBonusCount: 1,
    neutralDevelopmentBonusCount: 1,
    neutralDevelopmentBonusCubes: { red: 1, blue: 1, yellow: 0 },
    cityBuildsByLevel: { 1: 2, 2: 1, 3: 0 },
    emptyIntersectionBuilds: 2,
    stackedCityBuilds: 1,
    roundEndAreaStats: [
      {
        round: 1,
        neutralAreaCount: 4,
        areas: [
          { areaId: "a", color: "red", areaLevel: 1, cubes: { red: 1, blue: 0, yellow: 0 } },
          { areaId: "b", color: "neutral", areaLevel: 0, cubes: { red: 0, blue: 0, yellow: 0 } },
        ],
      },
    ],
  },
  replay: [
    { step: 0, eventType: "draft_pick", round: 1, playerId: "player-1", action: { type: "DRAFT_PICK", playerId: "player-1", cardInstanceId: "red-1" }, details: { cardType: "red-production" }, snapshot: baseSnapshot() },
    { step: 1, eventType: "draft_pick", round: 1, playerId: "player-2", action: { type: "DRAFT_PICK", playerId: "player-2", cardInstanceId: "tri-1" }, details: { cardType: "tricolor-city" }, snapshot: baseSnapshot() },
    { step: 2, eventType: "draft_pick", round: 1, playerId: "player-1", action: { type: "DRAFT_PICK", playerId: "player-1", cardInstanceId: "neutral-1" }, details: { cardType: "neutral-development" }, snapshot: baseSnapshot() },
    { step: 3, eventType: "card_use", round: 1, playerId: "player-1", action: { type: "USE_CARD", playerId: "player-1", cardInstanceId: "red-1", mode: "production" }, details: { cardType: "red-production", mode: "production" }, snapshot: baseSnapshot() },
    { step: 4, eventType: "card_use", round: 1, playerId: "player-1", action: { type: "USE_CARD", playerId: "player-1", cardInstanceId: "red-1", mode: "scoring" }, details: { cardType: "red-production", mode: "scoring" }, snapshot: baseSnapshot() },
    { step: 5, eventType: "card_use", round: 1, playerId: "player-2", action: { type: "USE_CARD", playerId: "player-2", cardInstanceId: "tri-1", mode: "production" }, details: { cardType: "tricolor-city", mode: "production" }, snapshot: baseSnapshot() },
    { step: 6, eventType: "special_development", round: 1, playerId: "player-1", action: { type: "END_TURN", playerId: "player-1", placements: [], bonusCubes: { red: 1, blue: 1 } }, details: { developmentType: "neutral-development" }, snapshot: baseSnapshot() },
  ],
});

const completedGameTwo = (): CompletedGameRecord => ({
  ...completedGameOne(),
  gameId: "game-000002",
  gameSeed: "seed-2",
  finalScores: [
    { playerId: "player-1", agent: { type: "random", name: "Random 1" }, finalScore: 12, contribution: 10, cityCount: 0, rank: 2 },
    { playerId: "player-2", agent: { type: "random", name: "Random 2" }, finalScore: 18, contribution: 15, cityCount: 1, rank: 1 },
  ],
  rankings: [
    { playerId: "player-2", agent: { type: "random", name: "Random 2" }, finalScore: 18, contribution: 15, cityCount: 1, rank: 1 },
    { playerId: "player-1", agent: { type: "random", name: "Random 1" }, finalScore: 12, contribution: 10, cityCount: 0, rank: 2 },
  ],
  winners: ["player-2"],
  finalWorldLevel: 3,
  finalBoard: areas(["red", "neutral", "neutral", "neutral", "neutral", "blue", "yellow"]),
  finalCityStacks: [
    {
      id: "intersection-03",
      x: 0,
      y: 0,
      adjacentAreaIds: [],
      city: null,
      cityStack: [{ playerId: "player-2", playerColor: "#1f6feb", level: 3 }],
    },
  ],
  stats: {
    worldLevelUnlocks: [
      { level: 2, step: 7, round: 3, playerId: "player-2" },
      { level: 3, step: 12, round: 3, playerId: "player-2" },
    ],
    draftedCards: { "red-production": 1, "blue-production": 0, "yellow-production": 0, "tricolor-city": 0, "neutral-development": 1 },
    usedCards: { "red-production": 1, "blue-production": 0, "yellow-production": 0, "tricolor-city": 0, "neutral-development": 1 },
    cardUseModes: { production: 1, scoring: 0, basic: 1 },
    tricolorBonusCount: 0,
    neutralDevelopmentBonusCount: 1,
    neutralDevelopmentBonusCubes: { red: 0, blue: 0, yellow: 2 },
    cityBuildsByLevel: { 1: 1, 2: 0, 3: 1 },
    emptyIntersectionBuilds: 1,
    stackedCityBuilds: 1,
    roundEndAreaStats: [
      {
        round: 1,
        neutralAreaCount: 5,
        areas: [
          { areaId: "a", color: "blue", areaLevel: 1, cubes: { red: 0, blue: 1, yellow: 0 } },
          { areaId: "b", color: "neutral", areaLevel: 0, cubes: { red: 0, blue: 0, yellow: 0 } },
        ],
      },
    ],
  },
  replay: [
    { step: 0, eventType: "draft_pick", round: 1, playerId: "player-2", action: { type: "DRAFT_PICK", playerId: "player-2", cardInstanceId: "red-2" }, details: { cardType: "red-production" }, snapshot: baseSnapshot() },
    { step: 1, eventType: "draft_pick", round: 1, playerId: "player-2", action: { type: "DRAFT_PICK", playerId: "player-2", cardInstanceId: "neutral-2" }, details: { cardType: "neutral-development" }, snapshot: baseSnapshot() },
    { step: 2, eventType: "card_use", round: 1, playerId: "player-2", action: { type: "USE_CARD", playerId: "player-2", cardInstanceId: "red-2", mode: "basic" }, details: { cardType: "red-production", mode: "basic" }, snapshot: baseSnapshot() },
    { step: 3, eventType: "card_use", round: 1, playerId: "player-2", action: { type: "USE_CARD", playerId: "player-2", cardInstanceId: "neutral-2", mode: "production" }, details: { cardType: "neutral-development", mode: "production" }, snapshot: baseSnapshot() },
    { step: 4, eventType: "special_development", round: 1, playerId: "player-2", action: { type: "END_TURN", playerId: "player-2", placements: [], bonusCubes: { yellow: 2 } }, details: { developmentType: "neutral-development" }, snapshot: baseSnapshot() },
  ],
});

const metadata = (): SimulationMetadata => ({
  schemaVersion: simulationSchemaVersion,
  runId: "run-fixture",
  createdAt: "2026-08-10T00:00:00.000Z",
  requestedGames: 2,
  completedGames: 2,
  failedGames: 0,
  playerCount: 2,
  runSeed: "fixture-seed",
  agents: {
    "player-1": { type: "random", name: "Random 1" },
    "player-2": { type: "random", name: "Random 2" },
  },
  rules: { package: "@sdb/game-core", schemaVersion: "game-core-v1" },
  logSchema: { schemaVersion: simulationSchemaVersion },
});

const summary = (): SimulationSummary => ({
  schemaVersion: simulationSchemaVersion,
  completedGames: 2,
  failedGames: 0,
  averageFinalScore: 15,
  winRateByPlayerPosition: { "player-1": 0.5, "player-2": 0.5 },
  averageFirstLastScoreGap: 8,
  level2ReachRate: 1,
  level2AverageReachStep: 6,
  level3ReachRate: 0.5,
  level3AverageReachStep: 12,
  cardUsesByType: { "red-production": 3, "blue-production": 0, "yellow-production": 0, "tricolor-city": 1, "neutral-development": 2 },
  cardUseModeRatios: { production: 4 / 6, scoring: 1 / 6, basic: 1 / 6 },
  averageCityCount: 2,
  cityBuildsByLevel: { 1: 3, 2: 1, 3: 1 },
  averageNeutralAreaCount: 3,
});

const writeRun = async (records: GameRecord[] = [completedGameOne(), completedGameTwo()]) => {
  const root = await mkdtemp(join(tmpdir(), "sdb-sim-viewer-"));
  temporaryDirectories.push(root);
  const runDirectory = join(root, "run-fixture");
  await mkdir(runDirectory);
  await writeFile(join(runDirectory, "metadata.json"), JSON.stringify(metadata()));
  await writeFile(join(runDirectory, "summary.json"), JSON.stringify(summary()));
  await writeFile(join(runDirectory, "games.jsonl"), `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return { root, runDirectory };
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories = [];
});

describe("simulation data loading", () => {
  it("loads normal runs, metadata, summary, and games", async () => {
    const { root } = await writeRun();
    const runs = await listSimulationRuns(root);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: "run-fixture",
      gameCount: 2,
      completedGames: 2,
      failedGames: 0,
      playerCount: 2,
      runSeed: "fixture-seed",
      schemaVersion: simulationSchemaVersion,
    });

    const details = await loadSimulationRun(root, "run-fixture");
    expect(details.metadata.runId).toBe("run-fixture");
    expect(details.summary.completedGames).toBe(2);
    expect(details.games.map((game) => game.gameId)).toEqual(["game-000001", "game-000002"]);

    const game = await loadSimulationGame(root, "run-fixture", "game-000001");
    expect(game.status).toBe("completed");
  });

  it("rejects unsupported schemaVersion", async () => {
    const { runDirectory, root } = await writeRun();
    await writeFile(join(runDirectory, "metadata.json"), JSON.stringify({ ...metadata(), schemaVersion: "old" }));
    const runs = await listSimulationRuns(root);
    expect(runs[0].schemaVersion).toBe("old");
    await expect(loadSimulationRun(root, "run-fixture")).rejects.toThrow(/unsupported schemaVersion/);
  });

  it("reports missing files clearly", async () => {
    const { runDirectory, root } = await writeRun();
    await rm(join(runDirectory, "summary.json"));
    await expect(loadSimulationRun(root, "run-fixture")).rejects.toThrow(/Missing required simulation file: summary.json/);
  });

  it("reports broken JSON clearly", async () => {
    const { runDirectory, root } = await writeRun();
    await writeFile(join(runDirectory, "metadata.json"), "{");
    await expect(loadSimulationRun(root, "run-fixture")).rejects.toThrow(/Invalid JSON in metadata.json/);
  });

  it("reports broken JSONL clearly", async () => {
    const { runDirectory, root } = await writeRun();
    await writeFile(join(runDirectory, "games.jsonl"), `${JSON.stringify(completedGameOne())}\n{`);
    await expect(loadSimulationRun(root, "run-fixture")).rejects.toThrow(/Invalid JSONL in games.jsonl at line 2/);
  });

  it("rejects path-like run ids", async () => {
    const { root } = await writeRun();
    await expect(loadSimulationRun(root, "../run-fixture")).rejects.toBeInstanceOf(SimulationDataError);
  });
});

describe("simulation aggregation", () => {
  it("computes score, level, card, city, and area statistics from fixture records", () => {
    const analysis = analyzeSimulationRun([completedGameOne(), completedGameTwo()], 2);
    expect(analysis.score.averageFinalScore).toBe(15);
    expect(analysis.score.medianFinalScore).toBe(15);
    expect(analysis.score.winRateByPlayerIndex).toEqual({ "player-1": 0.5, "player-2": 0.5 });
    expect(analysis.score.averageRankByPlayerIndex).toEqual({ "player-1": 1.5, "player-2": 1.5 });
    expect(analysis.levels.level2.reachRate).toBe(1);
    expect(analysis.levels.level3.reachRate).toBe(0.5);

    const redCard = analysis.cards.find((card) => card.type === "red-production");
    expect(redCard?.modeRatios).toEqual({ production: 1 / 3, scoring: 1 / 3, basic: 1 / 3 });
    expect(redCard?.drafterWinRate).toBe(1);

    const cityStats = analysis.cities;
    expect(cityStats.averageBuildsByLevel).toEqual({ 1: 1.5, 2: 0.5, 3: 0.5 });
    expect(cityStats.stackingRate).toBe(0.4);
    expect(cityStats.winnerAverageCitiesByLevel).toEqual({ 1: 1, 2: 0, 3: 0.5 });

    expect(analysis.areas.finalAverageAreaCounts.neutral).toBe(3);
  });
});
