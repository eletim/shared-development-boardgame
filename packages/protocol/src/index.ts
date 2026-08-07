export const cubeColors = ["red", "blue", "yellow"] as const;

export type CubeColor = (typeof cubeColors)[number];

export type CubeCounts = Record<CubeColor, number>;

export type PartialCubeCounts = Partial<Record<CubeColor, number>>;

export type GameStatus = "active" | "ended";

export type GamePhase = "draft" | "action" | "ended";

export type AreaColor = CubeColor | "neutral";

export type CardType =
  | "red-development"
  | "blue-development"
  | "yellow-development"
  | "focused-development"
  | "wide-development"
  | "redevelopment";

export type CardUseMode = "development" | "scoring" | "basic";

export type CardSummary = {
  instanceId: string;
  type: CardType;
  name: string;
  color: CubeColor | "multi";
  developmentText: string;
  scoringText: string;
};

export type CubePlacement = {
  areaId: string;
  cubes: PartialCubeCounts;
};

export type CubeMove = {
  fromAreaId: string;
  toAreaId: string;
  color: CubeColor;
};

export type PlayerSummary = {
  id: string;
  name: string;
  color: string;
  cubes: CubeCounts;
  cubeTotal: number;
  cityCount: number;
  contribution: number;
  finalScore: number;
  handCards: CardSummary[];
};

export type AreaSummary = {
  id: string;
  label: string;
  q: number;
  r: number;
  x: number;
  y: number;
  cubes: CubeCounts;
  cubeTotal: number;
  areaColor: AreaColor;
};

export type IntersectionSummary = {
  id: string;
  x: number;
  y: number;
  adjacentAreaIds: string[];
  city: { playerId: string; playerColor: string } | null;
};

export type ProductionEntry = {
  playerId: string;
  playerName: string;
  cubes: CubeCounts;
};

export type ActionLogEntry = {
  id: number;
  round: number;
  phase: GamePhase;
  playerId: string | null;
  playerName: string;
  type: GameAction["type"] | "ROUND_START" | "GAME_END";
  summary: string;
};

export type LegalInfo = {
  canUndo: boolean;
  canDraft: boolean;
  canUseCard: boolean;
  canBuildCity: boolean;
  draftPack: CardSummary[];
  buildableIntersectionIds: string[];
};

export type PublicGameState = {
  status: GameStatus;
  phase: GamePhase;
  round: number;
  maxRounds: number;
  worldLevel: 1 | 2 | 3;
  cityLevel: 1 | 2 | 3;
  areaCapacity: number;
  boardCubeTotal: number;
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  draftPickNumber: number;
  players: PlayerSummary[];
  areas: AreaSummary[];
  intersections: IntersectionSummary[];
  lastProduction: ProductionEntry[];
  history: ActionLogEntry[];
  legal: LegalInfo;
  winners: PlayerSummary[];
};

export type StartGameRequest = {
  playerNames: string[];
};

export type GameAction =
  | {
      type: "DRAFT_PICK";
      playerId: string;
      cardInstanceId: string;
    }
  | {
      type: "USE_CARD";
      playerId: string;
      cardInstanceId: string;
      mode: CardUseMode;
      basicColor?: CubeColor;
      areaId?: string;
      cubes?: PartialCubeCounts;
      placements?: CubePlacement[];
      move?: CubeMove;
    }
  | {
      type: "BUILD_CITY";
      playerId: string;
      intersectionId: string;
    };

export type GameResponse = {
  state: PublicGameState | null;
  error?: string;
};
