export const cubeColors = ["red", "blue", "yellow"] as const;

export type CubeColor = (typeof cubeColors)[number];

export type CubeCounts = Record<CubeColor, number>;

export type PartialCubeCounts = Partial<Record<CubeColor, number>>;

export type GameStatus = "active" | "ended";

export type PlayerSummary = {
  id: string;
  name: string;
  color: string;
  hand: CubeCounts;
  handTotal: number;
  cityCount: number;
  turnsTaken: number;
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
};

export type IntersectionSummary = {
  id: string;
  x: number;
  y: number;
  adjacentAreaIds: string[];
  city: { playerId: string; playerColor: string } | null;
};

export type ActionLogEntry = {
  id: number;
  round: number;
  playerId: string;
  playerName: string;
  type: GameAction["type"];
  summary: string;
};

export type LegalInfo = {
  canUndo: boolean;
  canPass: boolean;
  takeOptions: PartialCubeCounts[];
  placeableAreaIds: string[];
  buildableIntersections: Array<{
    intersectionId: string;
    adjacentAreaIds: string[];
    missingColors: CubeColor[];
  }>;
};

export type PublicGameState = {
  status: GameStatus;
  round: number;
  maxRounds: number;
  phase: 1 | 2 | 3;
  areaCapacity: number;
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  players: PlayerSummary[];
  supply: CubeCounts;
  areas: AreaSummary[];
  intersections: IntersectionSummary[];
  history: ActionLogEntry[];
  legal: LegalInfo;
  winners: PlayerSummary[];
};

export type StartGameRequest = {
  playerNames: string[];
};

export type GameAction =
  | {
      type: "TAKE_CUBES";
      playerId: string;
      cubes: PartialCubeCounts;
    }
  | {
      type: "PLACE_CUBES";
      playerId: string;
      areaId: string;
      cubes: PartialCubeCounts;
    }
  | {
      type: "BUILD_CITY";
      playerId: string;
      intersectionId: string;
      payment: Record<CubeColor, string>;
    }
  | {
      type: "PASS";
      playerId: string;
    };

export type GameResponse = {
  state: PublicGameState | null;
  error?: string;
};
