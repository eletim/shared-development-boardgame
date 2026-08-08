import { render, screen, waitFor } from "@testing-library/react";
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

const lastRequestInit = (mock: ReturnType<typeof vi.fn>): RequestInit => {
  const call = mock.mock.calls[mock.mock.calls.length - 1] as unknown[];
  return (call[1] ?? {}) as RequestInit;
};

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

  it("sends draft, card use, and build actions from the controls", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState("action") }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText(/カード手番/);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "基本取得" }));
    await userEvent.click(screen.getByRole("button", { name: "カードを使用" }));
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("USE_CARD");
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("basic");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action", true) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "置かずに手番終了" }));
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("END_TURN");
    expect(JSON.stringify(lastRequestInit(fetchMock))).not.toContain("placement");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: baseState("action") }),
    });
    await userEvent.selectOptions(screen.getByLabelText("エリア"), "area-center");
    await userEvent.click(screen.getByRole("button", { name: "1個置いて手番終了" }));
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("END_TURN");
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("placement");

    await userEvent.selectOptions(screen.getByLabelText("交点"), "intersection-01");
    await userEvent.click(screen.getByRole("button", { name: "都市を建設" }));
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("BUILD_CITY");

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
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("DRAFT_PICK");
  });

  it("shows server-calculated turn-end production preview", async () => {
    mockFetch([baseState("action", true)]);
    render(<App />);
    expect(await screen.findByText("追加生産見込み: 赤 2")).toBeInTheDocument();
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
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("CLAIM_WORLD_LEVEL_BONUS");
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("blue");
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
