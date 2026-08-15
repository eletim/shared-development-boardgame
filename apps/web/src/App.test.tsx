import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { type CardSummary, type PublicGameState } from "@sdb/protocol";

const card = (instanceId: string, name = "赤の生産"): CardSummary => ({
  instanceId,
  type: "red-production",
  name,
  color: "red",
  actionText: "赤1個を得る。ターン終了時、赤エリア1つにつき赤1個を得る",
  scoringText: "赤エリアとの各接続の 都市Lv × エリアLv",
});

const baseState = (
  phase: PublicGameState["phase"] = "draft",
  turnCardUsed = false
): PublicGameState => ({
  status: "active",
  phase,
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
  currentPlayerName: "A",
  turnCardUsed,
  turnEndProduction: turnCardUsed ? { color: "red", additionalCubes: 2 } : null,
  turnEndDevelopment: null,
  draftPickNumber: 1,
  players: [
    {
      id: "player-1",
      name: "A",
      color: "#d73a31",
      cubes: { red: 1, blue: 1, yellow: 1 },
      cubeTotal: 3,
      cityCount: 0,
      contribution: 0,
      finalScore: 0,
      handCards: phase === "action" ? [card("hand-1")] : [],
    },
    {
      id: "player-2",
      name: "B",
      color: "#1f6feb",
      cubes: { red: 0, blue: 0, yellow: 0 },
      cubeTotal: 0,
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
      y: -86,
      adjacentAreaIds: ["area-center"],
      city: null,
      cityStack: [],
    },
    {
      id: "intersection-02",
      x: 86,
      y: 0,
      adjacentAreaIds: ["area-center"],
      city: null,
      cityStack: [],
    },
  ],
  lastProduction: [
    { playerId: "player-1", playerName: "A", cubes: { red: 0, blue: 0, yellow: 0 } },
    { playerId: "player-2", playerName: "B", cubes: { red: 0, blue: 0, yellow: 0 } },
  ],
  history: [],
  legal: {
    canUndo: false,
    canDraft: phase === "draft",
    canUseCard: phase === "action" && !turnCardUsed,
    canBuildCity: phase === "action",
    canEndTurn: phase === "action" && turnCardUsed,
    canClaimWorldLevelBonus: false,
    draftPack: phase === "draft" ? [card("draft-1")] : [],
    buildableIntersectionIds: phase === "action" ? ["intersection-01"] : [],
    placeableAreaIds: phase === "action" && turnCardUsed ? ["area-center"] : [],
    turnEndAreaCapacity: 2,
  },
  winners: [],
});

const withBuildableIntersections = (
  state: PublicGameState,
  buildableIntersectionIds: string[]
): PublicGameState => ({
  ...state,
  legal: {
    ...state.legal,
    canBuildCity: buildableIntersectionIds.length > 0,
    buildableIntersectionIds,
  },
});

const mockFetch = (states: Array<PublicGameState | null>) => {
  let index = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const state = states[Math.min(index, states.length - 1)];
      index += 1;
      return {
        ok: true,
        json: async () => ({ state }),
      };
    })
  );
};

const simulationRun = {
  runId: "run-fixture",
  createdAt: "2026-08-10T00:00:00.000Z",
  gameCount: 1,
  completedGames: 1,
  failedGames: 0,
  playerCount: 2,
  runSeed: "fixture-seed",
  agents: {
    "player-1": { type: "random", name: "Random 1" },
    "player-2": { type: "random", name: "Random 2" },
  },
  schemaVersion: "simulation-log-v1",
};

const simulationDetails = {
  metadata: {
    schemaVersion: "simulation-log-v1",
    runId: simulationRun.runId,
    createdAt: simulationRun.createdAt,
    requestedGames: 1,
    completedGames: 1,
    failedGames: 0,
    playerCount: 2,
    runSeed: simulationRun.runSeed,
    agents: simulationRun.agents,
    rules: { package: "@sdb/game-core", schemaVersion: "game-core-v1" },
    logSchema: { schemaVersion: "simulation-log-v1" },
  },
  summary: {
    schemaVersion: "simulation-log-v1",
    completedGames: 1,
    failedGames: 0,
    averageFinalScore: 10,
    winRateByPlayerPosition: { "player-1": 1, "player-2": 0 },
    averageFirstLastScoreGap: 5,
    level2ReachRate: 1,
    level2AverageReachStep: 4,
    level3ReachRate: 0,
    level3AverageReachStep: null,
    cardUsesByType: {},
    cardUseModeRatios: { production: 1, scoring: 0, basic: 0 },
    averageCityCount: 1,
    cityBuildsByLevel: { 1: 1, 2: 0, 3: 0 },
    averageNeutralAreaCount: 3,
  },
  analysis: {
    score: {
      averageFinalScore: 10,
      medianFinalScore: 10,
      scoreDistribution: [{ bucket: "10-14", count: 1 }],
      averageFirstLastScoreGap: 5,
      winRateByPlayerIndex: { "player-1": 1, "player-2": 0 },
      averageRankByPlayerIndex: { "player-1": 1, "player-2": 2 },
    },
    levels: {
      level2: {
        level: 2,
        reachRate: 1,
        averageReachRound: 1,
        averageReachStep: 4,
        timingDistribution: [{ round: 1, count: 1 }],
        unlockPlayerIndexDistribution: { "player-1": 1 },
      },
      level3: {
        level: 3,
        reachRate: 0,
        averageReachRound: null,
        averageReachStep: null,
        timingDistribution: [],
        unlockPlayerIndexDistribution: {},
      },
    },
    cards: [],
    cities: {
      averageCityPiecesPerGame: 1,
      averageBuildsByLevel: { 1: 1, 2: 0, 3: 0 },
      emptyIntersectionBuilds: 1,
      stackedCityBuilds: 0,
      stackingRate: 0,
      winnerAverageCityCount: 1,
      winnerAverageCitiesByLevel: { 1: 1, 2: 0, 3: 0 },
    },
    areas: {
      finalAverageAreaCounts: { red: 1, blue: 0, yellow: 0, neutral: 3 },
      roundEndColorDistribution: [{ round: 1, colors: { red: 1, blue: 0, yellow: 0, neutral: 3 } }],
      roundEndAreaLevelDistribution: [{ round: 1, levels: { 0: 3, 1: 1, 2: 0, 3: 0 } }],
      neutralAreaTrend: [{ round: 1, averageNeutralAreas: 3 }],
      colorChangeCount: 0,
      neutralizationCount: 0,
    },
  },
  games: [
    {
      gameId: "game-000001",
      gameSeed: "seed-1",
      status: "completed",
      finalScores: [{ playerId: "player-1", score: 10, rank: 1 }],
      winners: ["player-1"],
      level2Timing: { round: 1, step: 4, playerId: "player-1" },
      level3Timing: null,
      finalWorldLevel: 2,
      scoreGap: 5,
      tags: ["no-lv3"],
    },
  ],
};

const mockAppAndSimulationFetch = (initialState: PublicGameState | null) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/game") {
        return { ok: true, json: async () => ({ state: initialState }) };
      }
      if (url === "/api/simulations/runs") {
        return { ok: true, json: async () => ({ runs: [simulationRun] }) };
      }
      if (url === "/api/simulations/runs/run-fixture") {
        return { ok: true, json: async () => simulationDetails };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );
};

const lastRequestInit = (mock: ReturnType<typeof vi.fn>): RequestInit => {
  const call = mock.mock.calls[mock.mock.calls.length - 1] as unknown[];
  return (call[1] ?? {}) as RequestInit;
};

const lastRequestBody = (mock: ReturnType<typeof vi.fn>): string =>
  String(lastRequestInit(mock).body ?? "");

describe("App", () => {
  it("starts a game from the setup screen", async () => {
    mockFetch([null, baseState()]);
    render(<App />);
    await screen.findByRole("button", { name: "ゲーム開始" });
    await userEvent.click(screen.getByRole("button", { name: "ゲーム開始" }));
    expect(await screen.findByText(/Round 1 \/ 3/)).toBeInTheDocument();
  });

  it("returns from an active game to the setup screen for a new game", async () => {
    mockFetch([baseState()]);
    render(<App />);
    await screen.findByText(/Round 1 \/ 3/);
    await userEvent.click(screen.getByRole("button", { name: "New game" }));
    expect(screen.getByRole("button", { name: "ゲーム開始" })).toBeInTheDocument();
  });

  it("switches from the setup screen to Simulation Viewer and back without changing hook order", async () => {
    mockAppAndSimulationFetch(null);
    render(<App />);

    await screen.findByRole("button", { name: "ゲーム開始" });
    await userEvent.click(screen.getByRole("button", { name: "Simulation Viewer" }));

    expect(await screen.findByRole("heading", { name: "Simulation Viewer" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "run-fixture" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(await screen.findByRole("heading", { name: "Run概要" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "通常ゲームへ戻る" }));
    expect(await screen.findByRole("button", { name: "ゲーム開始" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Simulation Viewer" }));
    expect(await screen.findByRole("heading", { name: "Simulation Viewer" })).toBeInTheDocument();
  });

  it("switches from an active game to Simulation Viewer and returns with the game state intact", async () => {
    mockAppAndSimulationFetch(baseState("action"));
    render(<App />);

    expect(await screen.findByText(/Round 1 \/ 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Simulation Viewer" }));

    expect(await screen.findByRole("heading", { name: "Simulation Viewer" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "run-fixture" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "通常ゲームへ戻る" }));
    expect(await screen.findByText(/Round 1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "カード選択" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulation Viewer" })).toHaveTextContent("Sim");
  });

  it("separates card controls from build and development controls without a city-production panel", async () => {
    mockFetch([baseState("action", true)]);
    render(<App />);

    const cardPanel = await screen.findByRole("complementary", { name: "カード選択" });
    const operationsPanel = screen.getByRole("complementary", { name: "都市建設・エリア開発" });
    const cardSection = (await screen.findByRole("heading", { name: "カード選択" })).closest("section");
    const citySection = screen.getByRole("heading", { name: "都市建設" }).closest("section");
    const developmentSection = screen.getByRole("heading", { name: "ターン終了時配置" }).closest("section");

    expect(screen.queryByRole("heading", { name: "都市生産" })).not.toBeInTheDocument();
    expect(within(cardPanel).queryByRole("heading", { name: "都市建設" })).not.toBeInTheDocument();
    expect(within(cardPanel).queryByRole("heading", { name: "ターン終了時配置" })).not.toBeInTheDocument();
    expect(within(operationsPanel).getByRole("heading", { name: "都市建設" })).toBeInTheDocument();
    expect(within(operationsPanel).getByRole("heading", { name: "ターン終了時配置" })).toBeInTheDocument();
    expect(cardSection).toHaveClass("card-actions");
    expect(citySection).toHaveClass("city-build-actions");
    expect(developmentSection).toHaveClass("development-actions");
  });

  it("keeps city production results available in history without listing zero production rows", async () => {
    const state = baseState("action", true);
    state.history = [{
      id: 1,
      round: 2,
      phase: "draft",
      playerId: null,
      playerName: "System",
      type: "ROUND_START",
      summary: "ラウンド2開始。都市生産: A 赤1",
    }];
    mockFetch([state]);
    render(<App />);

    expect(await screen.findByText("ラウンド2開始。都市生産: A 赤1")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "都市生産" })).not.toBeInTheDocument();
    expect(screen.queryByText("A なし")).not.toBeInTheDocument();
    expect(screen.queryByText("B なし")).not.toBeInTheDocument();
  });

  it("shows the newest history entry as the always-visible latest event", async () => {
    const state = baseState("action", true);
    state.history = [
      {
        id: 2,
        round: 1,
        phase: "action",
        playerId: "player-1",
        playerName: "A",
        type: "END_TURN",
        summary: "最新の手番終了",
      },
      {
        id: 1,
        round: 1,
        phase: "action",
        playerId: "player-1",
        playerName: "A",
        type: "USE_CARD",
        summary: "古いカード使用",
      },
    ];
    mockFetch([state]);
    render(<App />);

    const latestEvent = await screen.findByLabelText("最新イベント");
    expect(within(latestEvent).getByText("最新の手番終了")).toBeInTheDocument();
    expect(within(latestEvent).queryByText("古いカード使用")).not.toBeInTheDocument();
  });

  it("zooms only the board between the configured minimum and maximum", async () => {
    mockFetch([baseState("action", true)]);
    render(<App />);

    const boardSvg = await screen.findByTestId("board-svg");
    const cardPanel = screen.getByRole("complementary", { name: "カード選択" });
    const operationsPanel = screen.getByRole("complementary", { name: "都市建設・エリア開発" });
    const zoomOut = screen.getByRole("button", { name: "盤面を縮小" });
    const zoomReset = screen.getByRole("button", { name: "盤面を100%に戻す" });
    const zoomIn = screen.getByRole("button", { name: "盤面を拡大" });

    expect(zoomOut).toHaveTextContent("-");
    expect(zoomIn).toHaveTextContent("+");
    expect(screen.getByTestId("board-zoom-readout")).toHaveTextContent("100%");
    expect(boardSvg).toHaveStyle({ width: "100%", height: "100%" });
    expect(cardPanel).not.toHaveAttribute("style");
    expect(operationsPanel).not.toHaveAttribute("style");

    await userEvent.click(zoomIn);
    expect(screen.getByTestId("board-zoom-readout")).toHaveTextContent("125%");
    expect(boardSvg).toHaveStyle({ width: "125%", height: "125%" });
    expect(cardPanel).not.toHaveAttribute("style");
    expect(operationsPanel).not.toHaveAttribute("style");

    await userEvent.click(zoomIn);
    await userEvent.click(zoomIn);
    expect(screen.getByTestId("board-zoom-readout")).toHaveTextContent("150%");
    expect(boardSvg).toHaveStyle({ width: "150%", height: "150%" });
    expect(zoomIn).toBeDisabled();

    await userEvent.click(zoomReset);
    expect(screen.getByTestId("board-zoom-readout")).toHaveTextContent("100%");

    await userEvent.click(zoomOut);
    await userEvent.click(zoomOut);
    expect(screen.getByTestId("board-zoom-readout")).toHaveTextContent("75%");
    expect(boardSvg).toHaveStyle({ width: "75%", height: "75%" });
    expect(zoomOut).toBeDisabled();
  });

  it("sends draft, card use, and build actions from the controls", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState("action") }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText(/カード選択/);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "基本取得" }));
    await userEvent.click(screen.getByRole("button", { name: "カードを使用" }));
    expect(lastRequestBody(fetchMock)).toContain("USE_CARD");
    expect(lastRequestBody(fetchMock)).toContain("basic");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "置かずに手番終了" }));
    expect(lastRequestBody(fetchMock)).toContain("END_TURN");
    expect(lastRequestBody(fetchMock)).not.toContain("placement");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action") }),
    });
    await userEvent.selectOptions(screen.getByLabelText("エリア"), "area-center");
    await userEvent.click(screen.getByRole("button", { name: "1個置いて手番終了" }));
    expect(lastRequestBody(fetchMock)).toContain("END_TURN");
    expect(lastRequestBody(fetchMock)).toContain("placement");

    await userEvent.selectOptions(screen.getByLabelText("交点"), "intersection-01");
    await userEvent.click(screen.getByRole("button", { name: "都市を建設" }));
    expect(lastRequestBody(fetchMock)).toContain("BUILD_CITY");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("draft") }),
    });
  });

  it("sends draft pick actions", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState("draft") }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText(/ドラフト 1 \/ 8/);
    await userEvent.click(screen.getByRole("button", { name: /赤の生産/ }));
    expect(lastRequestBody(fetchMock)).toContain("DRAFT_PICK");
  });

  it("selects buildable intersections from the board before using a card", async () => {
    mockFetch([baseState("action")]);
    render(<App />);
    await screen.findByRole("heading", { name: "都市建設" });

    await userEvent.click(screen.getByRole("button", { name: "盤面を拡大" }));
    expect(screen.getByTestId("board-zoom-readout")).toHaveTextContent("125%");
    expect(screen.getByTestId("intersection-intersection-01")).toHaveClass("selectable");
    expect(screen.getByTestId("intersection-intersection-02")).not.toHaveClass("selectable");

    await userEvent.click(screen.getByTestId("intersection-intersection-01"));
    expect(screen.getByLabelText("交点")).toHaveValue("intersection-01");
    expect(screen.getByRole("option", { name: /intersection-01/ })).not.toBeDisabled();
    expect(screen.getByRole("option", { name: /intersection-02/ })).toBeDisabled();
  });

  it("keeps board city-build clicks enabled from server legal moves after a card action", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState("action") }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText(/カード選択/);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "カードを使用" }));
    expect(lastRequestBody(fetchMock)).toContain("USE_CARD");
    expect(lastRequestBody(fetchMock)).toContain("production");

    expect(await screen.findByText(/ターン終了時配置/)).toBeInTheDocument();
    expect(screen.getByTestId("intersection-intersection-01")).toHaveClass("selectable");

    await userEvent.click(screen.getByTestId("intersection-intersection-01"));
    expect(screen.getByLabelText("交点")).toHaveValue("intersection-01");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "都市を建設" }));
    expect(lastRequestBody(fetchMock)).toContain("BUILD_CITY");
    expect(lastRequestBody(fetchMock)).toContain("intersection-01");
  });

  it("keeps board city-build clicks enabled after scoring cards", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState("action") }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText(/カード選択/);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "得点" }));
    await userEvent.click(screen.getByRole("button", { name: "カードを使用" }));
    expect(await screen.findByText(/ターン終了時配置/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("intersection-intersection-01"));
    expect(screen.getByLabelText("交点")).toHaveValue("intersection-01");
  });

  it("keeps server area colors visible while turn-end placement areas are selectable", async () => {
    const placementState = baseState("action", true);
    placementState.areas[0].cubes = { red: 1, blue: 0, yellow: 0 };
    placementState.areas[0].cubeTotal = 1;
    placementState.areas[0].areaLevel = 1;
    placementState.areas[0].areaColor = "red";
    placementState.boardCubeTotal = 1;
    mockFetch([placementState]);
    render(<App />);

    expect(await screen.findByText("赤 Lv1 1/2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "盤面を拡大" }));
    await userEvent.click(screen.getByTestId("area-area-center"));
    expect(screen.getByLabelText("エリア")).toHaveValue("area-center");
    expect(screen.getByTestId("area-area-center")).toHaveClass("hex", "red", "selectable");
    expect(screen.getByTestId("area-area-center")).toHaveClass("selected");
  });

  it("updates area color from the latest server state after a placement response", async () => {
    const beforePlacement = baseState("action", true);
    beforePlacement.areas[0].cubes = { red: 1, blue: 0, yellow: 0 };
    beforePlacement.areas[0].cubeTotal = 1;
    beforePlacement.areas[0].areaLevel = 1;
    beforePlacement.areas[0].areaColor = "red";
    beforePlacement.boardCubeTotal = 1;

    const afterPlacement = baseState("action");
    afterPlacement.currentPlayerId = "player-2";
    afterPlacement.currentPlayerName = "B";
    afterPlacement.areas[0].cubes = { red: 1, blue: 1, yellow: 0 };
    afterPlacement.areas[0].cubeTotal = 2;
    afterPlacement.areas[0].areaLevel = 1;
    afterPlacement.areas[0].areaColor = "neutral";
    afterPlacement.boardCubeTotal = 2;
    afterPlacement.legal.placeableAreaIds = [];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: beforePlacement }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByText("赤 Lv1 1/2")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("色"), "blue");
    await userEvent.selectOptions(screen.getByLabelText("エリア"), "area-center");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: afterPlacement }),
    });
    await userEvent.click(screen.getByRole("button", { name: "1個置いて手番終了" }));

    expect(await screen.findByText("中立 Lv1 2/2")).toBeInTheDocument();
    expect(screen.getByTestId("area-area-center")).toHaveClass("neutral");
    expect(screen.getByTestId("area-area-center")).not.toHaveClass("red");
  });

  it("keeps board city-build clicks enabled after resolving a world level bonus", async () => {
    const pendingBonus = withBuildableIntersections(baseState("action", true), []);
    pendingBonus.worldLevel = 2;
    pendingBonus.areaCapacity = 4;
    pendingBonus.highestContribution = 15;
    pendingBonus.nextWorldLevelThreshold = 45;
    pendingBonus.pendingWorldLevelBonus = {
      level: 2,
      playerId: "player-1",
      playerName: "A",
    };
    pendingBonus.worldLevelUnlocks = [{
      level: 2,
      playerId: "player-1",
      playerName: "A",
      bonusColor: null,
    }];
    pendingBonus.legal.canClaimWorldLevelBonus = true;
    pendingBonus.legal.canEndTurn = false;
    pendingBonus.legal.placeableAreaIds = [];

    const resolvedBonus = baseState("action", true);
    resolvedBonus.worldLevel = 2;
    resolvedBonus.areaCapacity = 4;
    resolvedBonus.highestContribution = 15;
    resolvedBonus.nextWorldLevelThreshold = 45;
    resolvedBonus.worldLevelUnlocks = [{
      level: 2,
      playerId: "player-1",
      playerName: "A",
      bonusColor: "blue",
    }];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState("action") }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText(/カード選択/);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: pendingBonus }),
    });
    await userEvent.click(screen.getByRole("button", { name: "得点" }));
    await userEvent.click(screen.getByRole("button", { name: "カードを使用" }));
    expect(await screen.findByText("世界Lv2を解禁しました")).toBeInTheDocument();
    expect(screen.getByTestId("intersection-intersection-01")).not.toHaveClass("selectable");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: resolvedBonus }),
    });
    await userEvent.click(screen.getByRole("button", { name: "青" }));
    expect(await screen.findByText(/ターン終了時配置/)).toBeInTheDocument();
    expect(screen.getByTestId("intersection-intersection-01")).toHaveClass("selectable");

    await userEvent.click(screen.getByTestId("intersection-intersection-01"));
    expect(screen.getByLabelText("交点")).toHaveValue("intersection-01");
  });

  it("does not allow board clicks for intersections omitted from server legal moves", async () => {
    mockFetch([withBuildableIntersections(baseState("action", true), [])]);
    render(<App />);
    await screen.findByRole("heading", { name: "都市建設" });

    await userEvent.click(screen.getByTestId("intersection-intersection-01"));
    expect(screen.getByLabelText("交点")).toHaveValue("");
    expect(screen.getByRole("option", { name: /intersection-01/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "都市を建設" })).toBeDisabled();
  });

  it("allows another board city-build click in the same turn after a build response keeps resources legal", async () => {
    const afterFirstBuild = withBuildableIntersections(baseState("action", true), ["intersection-02"]);
    afterFirstBuild.intersections[0].cityStack = [{
      level: 1,
      playerId: "player-1",
      playerColor: "#d73a31",
    }];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("heading", { name: "都市建設" });

    await userEvent.click(screen.getByTestId("intersection-intersection-01"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: afterFirstBuild }),
    });
    await userEvent.click(screen.getByRole("button", { name: "都市を建設" }));
    expect(lastRequestBody(fetchMock)).toContain("intersection-01");

    expect(await screen.findByTestId("intersection-intersection-02")).toHaveClass("selectable");
    await userEvent.click(screen.getByTestId("intersection-intersection-02"));
    expect(screen.getByLabelText("交点")).toHaveValue("intersection-02");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: afterFirstBuild }),
    });
    await userEvent.click(screen.getByRole("button", { name: "都市を建設" }));
    expect(lastRequestBody(fetchMock)).toContain("intersection-02");
  });

  it("shows server-calculated turn-end production preview", async () => {
    mockFetch([baseState("action", true)]);
    render(<App />);
    expect(await screen.findByText("追加生産見込み: 赤 2")).toBeInTheDocument();
  });

  it("sends tricolor city placements to two distinct areas", async () => {
    const tricolorState = baseState("action", true);
    tricolorState.turnEndProduction = null;
    tricolorState.turnEndDevelopment = {
      type: "tricolor-city",
      maxPlacements: 2,
      placementRule: "distinct-areas",
    };
    tricolorState.areas.push({
      id: "area-east",
      label: "東",
      q: 1,
      r: 0,
      x: 120,
      y: 0,
      cubes: { red: 0, blue: 0, yellow: 0 },
      cubeTotal: 0,
      areaLevel: 0,
      areaColor: "neutral",
    });
    tricolorState.areas[0].cubes = { red: 0, blue: 0, yellow: 1 };
    tricolorState.areas[0].cubeTotal = 1;
    tricolorState.areas[0].areaLevel = 1;
    tricolorState.areas[0].areaColor = "yellow";
    tricolorState.legal.placeableAreaIds = ["area-center", "area-east"];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: tricolorState }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const developmentHeading = await screen.findByRole("heading", { name: "三色都市の開発" });
    const cityHeading = screen.getByRole("heading", { name: "都市建設" });
    expect(cityHeading.compareDocumentPosition(developmentHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("黄 Lv1 1/2")).toBeInTheDocument();
    expect(screen.getByTestId("area-area-center")).toHaveClass("yellow", "selectable");
    await userEvent.click(screen.getByRole("button", { name: "盤面を拡大" }));
    await userEvent.click(screen.getByTestId("area-area-center"));
    expect(screen.getByLabelText("1個目 エリア")).toHaveValue("area-center");
    expect(screen.getByTestId("area-area-center")).toHaveClass("yellow", "selected");
    await userEvent.selectOptions(screen.getByLabelText("2個目 色"), "blue");
    await userEvent.selectOptions(screen.getByLabelText("2個目 エリア"), "area-east");
    await userEvent.click(screen.getByRole("button", { name: "選択分を置いて手番終了" }));

    expect(lastRequestBody(fetchMock)).toContain("END_TURN");
    expect(lastRequestBody(fetchMock)).toContain("placements");
    expect(lastRequestBody(fetchMock)).toContain("area-center");
    expect(lastRequestBody(fetchMock)).toContain("area-east");
  });

  it("sends neutral development placements and arbitrary bonus cube choices", async () => {
    const neutralState = baseState("action", true);
    neutralState.turnEndProduction = null;
    neutralState.turnEndDevelopment = {
      type: "neutral-development",
      maxPlacements: 2,
      placementRule: "same-area",
    };
    neutralState.areas[0].cubes = { red: 0, blue: 1, yellow: 0 };
    neutralState.areas[0].cubeTotal = 1;
    neutralState.areas[0].areaColor = "blue";
    neutralState.areas[0].areaLevel = 1;
    neutralState.boardCubeTotal = 1;
    neutralState.intersections[0].cityStack = [
      { playerId: "player-1", playerColor: "#d73a31", level: 1 },
      { playerId: "player-2", playerColor: "#1f6feb", level: 2 },
    ];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: neutralState }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const neutralHeading = await screen.findByRole("heading", { name: "中立開発" });
    const cityHeading = screen.getByRole("heading", { name: "都市建設" });
    expect(cityHeading.compareDocumentPosition(neutralHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "盤面を拡大" }));
    await userEvent.click(screen.getByTestId("area-area-center"));
    expect(screen.getByLabelText("対象エリア")).toHaveValue("area-center");
    expect(screen.getByText("現在色: 青 / 中立で解決される場合の任意色取得上限 2個")).toBeInTheDocument();
    expect(screen.getByTestId("area-area-center")).toHaveClass("blue", "selectable", "selected");
    await userEvent.selectOptions(screen.getByLabelText("配置数"), "1");
    expect(await screen.findByText(/任意色取得上限 2個/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("赤取得"));
    await userEvent.type(screen.getByLabelText("赤取得"), "1");
    await userEvent.clear(screen.getByLabelText("青取得"));
    await userEvent.type(screen.getByLabelText("青取得"), "1");

    await userEvent.click(screen.getByRole("button", { name: "中立開発を解決して手番終了" }));
    expect(lastRequestBody(fetchMock)).toContain("END_TURN");
    expect(lastRequestBody(fetchMock)).toContain("developmentAreaId");
    expect(lastRequestBody(fetchMock)).toContain("bonusCubes");
    expect(lastRequestBody(fetchMock)).toContain('"red":1');
    expect(lastRequestBody(fetchMock)).toContain('"blue":1');
  });

  it("shows world level progress and sends unlock bonus choices", async () => {
    const unlocked = baseState("action", true);
    unlocked.worldLevel = 2;
    unlocked.areaCapacity = 4;
    unlocked.highestContribution = 15;
    unlocked.nextWorldLevelThreshold = 45;
    unlocked.pendingWorldLevelBonus = {
      level: 2,
      playerId: "player-1",
      playerName: "A",
    };
    unlocked.worldLevelUnlocks = [{
      level: 2,
      playerId: "player-1",
      playerName: "A",
      bonusColor: null,
    }];
    unlocked.legal.canClaimWorldLevelBonus = true;
    unlocked.legal.canBuildCity = false;
    unlocked.legal.canEndTurn = false;
    unlocked.legal.buildableIntersectionIds = [];
    unlocked.legal.placeableAreaIds = [];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: unlocked }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(await screen.findByText(/世界Lv2 \/ 次の解禁: 45点 \/ 現在最高: 15点/)).toBeInTheDocument();
    expect(screen.getByText("世界Lv2を解禁しました")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "青" }));
    expect(lastRequestBody(fetchMock)).toContain("CLAIM_WORLD_LEVEL_BONUS");
    expect(lastRequestBody(fetchMock)).toContain("blue");
  });

  it("only enables turn-end placement areas that fit the next capacity", async () => {
    const fullArea = baseState("action", true);
    fullArea.areas[0].cubes = { red: 2, blue: 0, yellow: 0 };
    fullArea.areas[0].cubeTotal = 2;
    fullArea.areas[0].areaLevel = 1;
    fullArea.boardCubeTotal = 2;
    fullArea.legal.placeableAreaIds = [];
    mockFetch([fullArea]);
    const { unmount } = render(<App />);
    expect(await screen.findByRole("option", { name: "中央 2/2" })).toBeDisabled();
    unmount();

    const boundaryArea = baseState("action", true);
    boundaryArea.areas[0].cubes = { red: 2, blue: 0, yellow: 0 };
    boundaryArea.areas[0].cubeTotal = 2;
    boundaryArea.areas[0].areaLevel = 1;
    boundaryArea.boardCubeTotal = 13;
    boundaryArea.areaCapacity = 2;
    boundaryArea.legal.placeableAreaIds = ["area-center"];
    boundaryArea.legal.turnEndAreaCapacity = 4;
    mockFetch([boundaryArea]);
    render(<App />);
    expect(await screen.findByRole("option", { name: "中央 2/4" })).not.toBeDisabled();
  });

  it("shows errors and ended game results", async () => {
    const ended = baseState("ended");
    ended.status = "ended";
    ended.currentPlayerId = null;
    ended.currentPlayerName = null;
    ended.winners = [ended.players[0]];
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ state: ended, error: "不正な操作です。" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await waitFor(() => expect(screen.getByText("不正な操作です。")).toBeInTheDocument());
    expect(screen.getByText(/勝者: A/)).toBeInTheDocument();
  });
});
