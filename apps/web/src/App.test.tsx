import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { type PublicGameState } from "@sdb/protocol";

const baseState = (): PublicGameState => ({
  status: "active",
  round: 1,
  maxRounds: 12,
  phase: 1,
  areaCapacity: 3,
  currentPlayerId: "player-1",
  currentPlayerName: "A",
  players: [
    {
      id: "player-1",
      name: "A",
      color: "#d73a31",
      hand: { red: 1, blue: 1, yellow: 1 },
      handTotal: 3,
      cityCount: 0,
      turnsTaken: 0,
    },
    {
      id: "player-2",
      name: "B",
      color: "#1f6feb",
      hand: { red: 0, blue: 0, yellow: 0 },
      handTotal: 0,
      cityCount: 0,
      turnsTaken: 0,
    },
  ],
  supply: { red: 14, blue: 14, yellow: 14 },
  areas: [
    {
      id: "area-center",
      label: "中央",
      q: 0,
      r: 0,
      x: 0,
      y: 0,
      cubes: { red: 1, blue: 1, yellow: 1 },
      cubeTotal: 3,
    },
  ],
  intersections: [
    {
      id: "intersection-01",
      x: 0,
      y: -86,
      adjacentAreaIds: ["area-center"],
      city: null,
    },
  ],
  history: [],
  legal: {
    canUndo: false,
    canPass: true,
    takeOptions: [{ red: 1, blue: 1, yellow: 1 }],
    placeableAreaIds: ["area-center"],
    buildableIntersections: [
      {
        intersectionId: "intersection-01",
        adjacentAreaIds: ["area-center"],
        missingColors: [],
      },
    ],
  },
  winners: [],
});

const mockFetch = (states: PublicGameState[]) => {
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
    mockFetch([null as unknown as PublicGameState, baseState()]);
    render(<App />);
    await screen.findByRole("button", { name: "ゲーム開始" });
    await userEvent.click(screen.getByRole("button", { name: "ゲーム開始" }));
    expect(await screen.findByText(/Round 1 \/ 12/)).toBeInTheDocument();
  });

  it("sends take, place and build actions from the controls", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: baseState() }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText(/Round 1 \/ 12/);

    await userEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("TAKE_CUBES");

    await userEvent.click(screen.getByRole("button", { name: "置く" }));
    await userEvent.selectOptions(screen.getByLabelText("エリア"), "area-center");
    await userEvent.clear(screen.getByLabelText("赤"));
    await userEvent.type(screen.getByLabelText("赤"), "1");
    await userEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("PLACE_CUBES");

    await userEvent.click(screen.getByRole("button", { name: "建設" }));
    await userEvent.selectOptions(screen.getByLabelText("交点"), "intersection-01");
    await userEvent.selectOptions(screen.getByLabelText("赤"), "area-center");
    await userEvent.selectOptions(screen.getByLabelText("青"), "area-center");
    await userEvent.selectOptions(screen.getByLabelText("黄"), "area-center");
    await userEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(JSON.stringify(lastRequestInit(fetchMock))).toContain("BUILD_CITY");
  });

  it("shows errors and ended game results", async () => {
    const ended = baseState();
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
