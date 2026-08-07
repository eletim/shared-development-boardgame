export const cubeColors = ["red", "blue", "yellow"] as const;

export type CubeColor = (typeof cubeColors)[number];

export type CubeCounts = Record<CubeColor, number>;

export type PartialCubeCounts = Partial<Record<CubeColor, number>>;

export type GameStatus = "draft" | "active" | "ended";

export type AreaColor = CubeColor | "neutral";

export type CardKind =
  | "red-development"
  | "blue-development"
  | "yellow-development"
  | "focused-development"
  | "redevelopment"
  | "urbanization";

export type CardUseKind = "take" | "place" | "build" | "score";

export type CardDefinition = {
  kind: CardKind;
  name: string;
  accelerationUse: Exclude<CardUseKind, "score">;
  accelerationText: string;
  scoringText: string;
};

export type CardInstance = {
  id: string;
  kind: CardKind;
};

export const cardDefinitions: Record<CardKind, CardDefinition> = {
  "red-development": {
    kind: "red-development",
    name: "赤の発展",
    accelerationUse: "take",
    accelerationText: "取得後に赤キューブを追加で1個取る。",
    scoringText: "赤エリア1つにつき1貢献度。",
  },
  "blue-development": {
    kind: "blue-development",
    name: "青の発展",
    accelerationUse: "take",
    accelerationText: "取得後に青キューブを追加で1個取る。",
    scoringText: "青エリア1つにつき1貢献度。",
  },
  "yellow-development": {
    kind: "yellow-development",
    name: "黄の発展",
    accelerationUse: "take",
    accelerationText: "取得後に黄キューブを追加で1個取る。",
    scoringText: "黄エリア1つにつき1貢献度。",
  },
  "focused-development": {
    kind: "focused-development",
    name: "集中開発",
    accelerationUse: "place",
    accelerationText: "配置アクションで置ける最大数を+1する。",
    scoringText: "容量上限まで埋まったエリア1つにつき1貢献度。",
  },
  redevelopment: {
    kind: "redevelopment",
    name: "再開発",
    accelerationUse: "place",
    accelerationText: "配置前に盤面上のキューブ1個を隣接エリアへ移動する。",
    scoringText: "中立エリア1つにつき1貢献度。",
  },
  urbanization: {
    kind: "urbanization",
    name: "都市化",
    accelerationUse: "build",
    accelerationText: "街建設時、任意の1色の支払いを免除する。",
    scoringText: "自分の街1個につき1貢献度。",
  },
};

export type PlayerSummary = {
  id: string;
  name: string;
  color: string;
  hand: CubeCounts;
  handTotal: number;
  cityCount: number;
  scoreFromCards: number;
  projectedContribution: number;
  cards: CardInstance[];
  usedCards: CardInstance[];
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
  areaColor: AreaColor;
  currentPlacementLimit: number;
  hasCurrentPlayerCityBonus: boolean;
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
  draftPickCardIds: string[];
  takeOptions: PartialCubeCounts[];
  placeableAreaIds: string[];
  scoreableCardIds: string[];
  accelerationCardIds: Partial<Record<Exclude<CardUseKind, "score">, string[]>>;
  buildableIntersections: Array<{
    intersectionId: string;
    adjacentAreaIds: string[];
    missingColors: CubeColor[];
  }>;
};

export type DraftSummary = {
  round: number;
  totalRounds: number;
  currentPlayerId: string;
  currentPlayerName: string;
  currentPack: CardInstance[];
  pickedCounts: Record<string, number>;
};

export type PublicGameState = {
  status: GameStatus;
  round: number;
  maxRounds: number;
  phase: 1 | 2 | 3;
  areaCapacity: number;
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  draft: DraftSummary | null;
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
      type: "DRAFT_PICK";
      playerId: string;
      cardId: string;
    }
  | {
      type: "TAKE_CUBES";
      playerId: string;
      cubes: PartialCubeCounts;
      accelerateCardId?: string;
    }
  | {
      type: "PLACE_CUBES";
      playerId: string;
      areaId: string;
      cubes: PartialCubeCounts;
      accelerateCardId?: string;
      redevelopmentMove?: {
        color: CubeColor;
        fromAreaId: string;
        toAreaId: string;
      };
    }
  | {
      type: "BUILD_CITY";
      playerId: string;
      intersectionId: string;
      payment: Partial<Record<CubeColor, string>>;
      accelerateCardId?: string;
      waivedColor?: CubeColor;
    }
  | {
      type: "SCORE_CARD";
      playerId: string;
      cardId: string;
    }
  | {
      type: "PASS";
      playerId: string;
    };

export type GameResponse = {
  state: PublicGameState | null;
  error?: string;
};
