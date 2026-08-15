import { describe, expect, it } from "vitest";
import { type CardSummary, type PublicGameState } from "@sdb/protocol";
import { deriveGameGuidance } from "./guidance";

const card: CardSummary = {
  instanceId: "card-1",
  type: "red-production",
  name: "赤の生産",
  color: "red",
  actionText: "赤1個を得る",
  scoringText: "赤エリアを得点化する",
};

const baseState = (phase: PublicGameState["phase"], turnCardUsed = false): PublicGameState => ({
  status: phase === "ended" ? "ended" : "active",
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
  turnEndProduction: null,
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
      handCards: phase === "action" ? [card] : [],
    },
  ],
  areas: [],
  intersections: [],
  lastProduction: [],
  history: [],
  legal: {
    canUndo: false,
    canDraft: phase === "draft",
    canUseCard: phase === "action" && !turnCardUsed,
    canBuildCity: phase === "action",
    canEndTurn: phase === "action" && turnCardUsed,
    canClaimWorldLevelBonus: false,
    draftPack: phase === "draft" ? [card] : [],
    buildableIntersectionIds: phase === "action" ? ["intersection-1"] : [],
    placeableAreaIds: phase === "action" && turnCardUsed ? ["area-1"] : [],
    turnEndAreaCapacity: 2,
  },
  winners: [],
});

const guidance = (
  state: PublicGameState,
  overrides: Partial<Parameters<typeof deriveGameGuidance>[0]> = {},
) =>
  deriveGameGuidance({
    state,
    selectedCard: null,
    useMode: "production",
    selectedAreaId: "",
    secondAreaId: "",
    neutralAreaId: "",
    neutralPlacementCount: 0,
    buildIntersectionId: "",
    ...overrides,
  });

describe("deriveGameGuidance", () => {
  it("makes draft card choice the primary task", () => {
    const result = guidance(baseState("draft"));
    expect(result.focus).toBe("draft");
    expect(result.title).toContain("ドラフト");
    expect(result.target).toBe("ドラフトカード");
  });

  it("moves from hand choice to mode confirmation after selecting a card", () => {
    const actionState = baseState("action");
    expect(guidance(actionState).focus).toBe("card");

    const result = guidance(actionState, { selectedCard: card, useMode: "scoring" });
    expect(result.focus).toBe("mode");
    expect(result.required).toEqual(["用途を選択", "カードを使用"]);
    expect(result.detail).toContain("得点");
  });

  it("points card-used turns toward board placement and optional skip", () => {
    const result = guidance(baseState("action", true));
    expect(result.focus).toBe("area");
    expect(result.title).toContain("エリア");
    expect(result.optional).toContain("置かずに手番終了できます");
  });

  it("distinguishes tricolor, neutral, and world bonus resolutions", () => {
    const tricolor = baseState("action", true);
    tricolor.turnEndDevelopment = { type: "tricolor-city", maxPlacements: 2, placementRule: "distinct-areas" };
    expect(guidance(tricolor, { selectedAreaId: "area-1" }).eyebrow).toBe("三色都市の開発");

    const neutral = baseState("action", true);
    neutral.turnEndDevelopment = { type: "neutral-development", maxPlacements: 2, placementRule: "same-area" };
    expect(guidance(neutral, { neutralAreaId: "area-1", neutralPlacementCount: 2 }).eyebrow).toBe("中立開発");

    const bonus = baseState("action", true);
    bonus.pendingWorldLevelBonus = { level: 2, playerId: "player-1", playerName: "A" };
    expect(guidance(bonus).focus).toBe("bonus");
  });

  it("prioritizes errors and final results over normal action guidance", () => {
    expect(guidance(baseState("action"), { hasError: true }).focus).toBe("error");
    expect(guidance(baseState("ended")).focus).toBe("result");
  });
});
