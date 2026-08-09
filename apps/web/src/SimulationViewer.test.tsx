import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SimulationViewer } from "./SimulationViewer";

const snapshot = (areaColor: "neutral" | "red", score: number, city = false) => ({
  status: "active",
  phase: "action",
  round: 1,
  maxRounds: 3,
  worldLevel: areaColor === "red" ? 2 : 1,
  cityLevel: 1,
  areaCapacity: 2,
  boardCubeTotal: areaColor === "red" ? 1 : 0,
  highestContribution: score,
  nextWorldLevelThreshold: areaColor === "red" ? 45 : 15,
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
      cubes: { red: areaColor === "red" ? 2 : 1, blue: 0, yellow: 0 },
      cubeTotal: areaColor === "red" ? 2 : 1,
      cityCount: city ? 1 : 0,
      contribution: score,
      finalScore: score,
      handCards: [],
    },
    {
      id: "player-2",
      name: "Player 2",
      color: "#1f6feb",
      cubes: { red: 0, blue: 1, yellow: 0 },
      cubeTotal: 1,
      cityCount: 0,
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
      cubes: { red: areaColor === "red" ? 1 : 0, blue: 0, yellow: 0 },
      cubeTotal: areaColor === "red" ? 1 : 0,
      areaLevel: areaColor === "red" ? 1 : 0,
      areaColor,
    },
  ],
  intersections: [
    {
      id: "intersection-01",
      x: 0,
      y: -86,
      adjacentAreaIds: ["area-center"],
      city: null,
      cityStack: city ? [{ playerId: "player-1", playerColor: "#d73a31", level: 1 }] : [],
    },
  ],
  lastProduction: [],
  winners: [],
  draftPacks: [],
});

const runDetails = {
  metadata: {
    schemaVersion: "simulation-log-v1",
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
    logSchema: { schemaVersion: "simulation-log-v1" },
  },
  summary: {
    schemaVersion: "simulation-log-v1",
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
    cardUseModeRatios: { production: 0.5, scoring: 0.25, basic: 0.25 },
    averageCityCount: 2,
    cityBuildsByLevel: { 1: 3, 2: 1, 3: 1 },
    averageNeutralAreaCount: 3,
  },
  analysis: {
    score: {
      averageFinalScore: 15,
      medianFinalScore: 15,
      scoreDistribution: [{ bucket: "10-14", count: 2 }, { bucket: "15-19", count: 1 }, { bucket: "20-24", count: 1 }],
      averageFirstLastScoreGap: 8,
      winRateByPlayerIndex: { "player-1": 0.5, "player-2": 0.5 },
      averageRankByPlayerIndex: { "player-1": 1.5, "player-2": 1.5 },
    },
    levels: {
      level2: {
        level: 2,
        reachRate: 1,
        averageReachRound: 2.5,
        averageReachStep: 6,
        timingDistribution: [{ round: 2, count: 1 }, { round: 3, count: 1 }],
        unlockPlayerIndexDistribution: { "player-1": 1, "player-2": 1 },
      },
      level3: {
        level: 3,
        reachRate: 0.5,
        averageReachRound: 3,
        averageReachStep: 12,
        timingDistribution: [{ round: 3, count: 1 }],
        unlockPlayerIndexDistribution: { "player-1": 0, "player-2": 1 },
      },
    },
    cards: [
      {
        type: "red-production",
        draftCount: 2,
        useCount: 3,
        actionUseCount: 1,
        scoringUseCount: 1,
        basicUseCount: 1,
        modeRatios: { production: 1 / 3, scoring: 1 / 3, basic: 1 / 3 },
        drafterAverageFinalScore: 19,
        drafterAverageRank: 1,
        drafterWinRate: 1,
      },
    ],
    cities: {
      averageCityPiecesPerGame: 2,
      averageBuildsByLevel: { 1: 1.5, 2: 0.5, 3: 0.5 },
      emptyIntersectionBuilds: 3,
      stackedCityBuilds: 2,
      stackingRate: 0.4,
      winnerAverageCityCount: 1.5,
      winnerAverageCitiesByLevel: { 1: 1, 2: 0, 3: 0.5 },
    },
    areas: {
      finalAverageAreaCounts: { red: 1.5, blue: 1.5, yellow: 1, neutral: 3 },
      roundEndColorDistribution: [{ round: 1, colors: { red: 1, blue: 1, yellow: 0, neutral: 2 } }],
      roundEndAreaLevelDistribution: [{ round: 1, levels: { 0: 2, 1: 2, 2: 0, 3: 0 } }],
      neutralAreaTrend: [{ round: 1, averageNeutralAreas: 3 }],
      colorChangeCount: null,
      neutralizationCount: null,
    },
  },
  games: [
    {
      gameId: "game-000001",
      gameSeed: "seed-1",
      status: "completed",
      finalScores: [{ playerId: "player-1", score: 20, rank: 1 }, { playerId: "player-2", score: 10, rank: 2 }],
      winners: ["player-1"],
      level2Timing: { round: 2, step: 5, playerId: "player-1" },
      level3Timing: null,
      finalWorldLevel: 2,
      scoreGap: 10,
      tags: ["no-lv3"],
    },
  ],
};

const gameRecord = {
  schemaVersion: "simulation-log-v1",
  status: "completed",
  gameId: "game-000001",
  gameSeed: "seed-1",
  playerCount: 2,
  agents: runDetails.metadata.agents,
  finalScores: [],
  rankings: [],
  winners: ["player-1"],
  finalWorldLevel: 2,
  finalBoard: [],
  finalCityStacks: [],
  stats: runDetails.analysis,
  replay: [
    {
      step: 0,
      eventType: "game_start",
      round: 1,
      playerId: null,
      action: null,
      details: {},
      snapshot: snapshot("neutral", 0, false),
    },
    {
      step: 1,
      eventType: "city_build",
      round: 1,
      playerId: "player-1",
      action: { type: "BUILD_CITY", playerId: "player-1", intersectionId: "intersection-01" },
      details: { level: 1 },
      snapshot: snapshot("red", 5, true),
    },
  ],
};

const mockViewerFetch = () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/simulations/runs") {
      return { ok: true, json: async () => ({ runs: [{ ...runDetails.metadata, gameCount: 2 }] }) };
    }
    if (url === "/api/simulations/runs/run-fixture") {
      return { ok: true, json: async () => runDetails };
    }
    if (url === "/api/simulations/runs/run-fixture/games/game-000001") {
      return { ok: true, json: async () => gameRecord };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
};

describe("SimulationViewer", () => {
  it("shows the run list, opens a run, and renders summary, statistics, and game list", async () => {
    mockViewerFetch();
    render(<SimulationViewer onBackToGame={() => {}} />);

    expect(await screen.findByRole("cell", { name: "run-fixture" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "開く" }));

    expect(await screen.findByRole("heading", { name: "Run概要" })).toBeInTheDocument();
    expect(screen.getAllByText("fixture-seed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("最終得点平均")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "カード統計" })).toBeInTheDocument();
    expect(screen.getByText("赤の生産")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "game-000001" })).toBeInTheDocument();
  });

  it("loads a game and moves replay steps using saved snapshots", async () => {
    mockViewerFetch();
    render(<SimulationViewer onBackToGame={() => {}} />);

    await userEvent.click(await screen.findByRole("button", { name: "開く" }));
    await userEvent.click(await screen.findByRole("button", { name: "Replay" }));

    expect(await screen.findByText("step 0 / 1")).toBeInTheDocument();
    expect(screen.getByText("中立 Lv0 0/2")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "プレイヤー状態" })).toHaveTextContent("player-1");
    expect(screen.getByRole("table", { name: "プレイヤー状態" })).toHaveTextContent("赤1 青0 黄0");

    await userEvent.click(screen.getByRole("button", { name: "1step進む" }));
    expect(screen.getByText("step 1 / 1")).toBeInTheDocument();
    expect(screen.getByText("赤 Lv1 1/2")).toBeInTheDocument();
    expect(screen.getByText("player-1 Lv1")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "プレイヤー状態" })).getByText("5")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "1step戻る" }));
    expect(screen.getByText("step 0 / 1")).toBeInTheDocument();
    expect(screen.getByText("中立 Lv0 0/2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "最後へ" }));
    expect(screen.getByText("step 1 / 1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "先頭へ" }));
    expect(screen.getByText("step 0 / 1")).toBeInTheDocument();
  });
});
