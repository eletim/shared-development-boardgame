import type {
  AreaColor,
  CardType,
  CardUseMode,
  CubeCounts,
  GameAction,
  PublicGameState,
  CardSummary,
} from "@sdb/protocol";

export const simulationSchemaVersion = "simulation-log-v1";

export type AgentConfig = {
  type: "random";
  name: string;
};

export type ReplayEventType =
  | "game_start"
  | "draft_pick"
  | "card_use"
  | "city_build"
  | "turn_end_development"
  | "special_development"
  | "score_gain"
  | "world_level_unlock"
  | "world_level_bonus"
  | "city_production"
  | "round_start"
  | "round_end"
  | "game_end"
  | "failure";

export type ReplaySnapshot = Omit<PublicGameState, "history" | "legal"> & {
  draftPacks: CardSummary[][];
};

export type ReplayStep = {
  step: number;
  eventType: ReplayEventType;
  round: number;
  playerId: string | null;
  action: GameAction | null;
  details: Record<string, unknown>;
  snapshot: ReplaySnapshot;
};

export type WorldLevelUnlockTiming = {
  level: 2 | 3;
  step: number;
  round: number;
  playerId: string;
};

export type RoundEndAreaStats = {
  round: number;
  areas: {
    areaId: string;
    color: AreaColor;
    areaLevel: 0 | 1 | 2 | 3;
    cubes: CubeCounts;
  }[];
  neutralAreaCount: number;
};

export type GameStats = {
  worldLevelUnlocks: WorldLevelUnlockTiming[];
  draftedCards: Record<CardType, number>;
  usedCards: Record<CardType, number>;
  cardUseModes: Record<CardUseMode, number>;
  tricolorBonusCount: number;
  neutralDevelopmentBonusCount: number;
  neutralDevelopmentBonusCubes: CubeCounts;
  cityBuildsByLevel: Record<1 | 2 | 3, number>;
  emptyIntersectionBuilds: number;
  stackedCityBuilds: number;
  roundEndAreaStats: RoundEndAreaStats[];
};

export type PlayerResult = {
  playerId: string;
  agent: AgentConfig;
  finalScore: number;
  contribution: number;
  cityCount: number;
  rank: number;
};

export type CompletedGameRecord = {
  schemaVersion: string;
  status: "completed";
  gameId: string;
  gameSeed: string;
  playerCount: number;
  agents: Record<string, AgentConfig>;
  finalScores: PlayerResult[];
  rankings: PlayerResult[];
  winners: string[];
  finalWorldLevel: 1 | 2 | 3;
  finalBoard: PublicGameState["areas"];
  finalCityStacks: PublicGameState["intersections"];
  stats: GameStats;
  replay: ReplayStep[];
};

export type FailedGameRecord = {
  schemaVersion: string;
  status: "failed";
  gameId: string;
  gameSeed: string;
  playerCount: number;
  agents: Record<string, AgentConfig>;
  failure: {
    reason: string;
    decisionCount: number;
  };
  replay: ReplayStep[];
};

export type GameRecord = CompletedGameRecord | FailedGameRecord;

export type SimulationRunOptions = {
  games: number;
  players: number;
  seed: string;
  outputDirectory: string;
  maxDecisionsPerGame?: number;
  retainRecords?: boolean;
};

export type SimulationMetadata = {
  schemaVersion: string;
  runId: string;
  createdAt: string;
  requestedGames: number;
  completedGames: number;
  failedGames: number;
  playerCount: number;
  runSeed: string;
  agents: Record<string, AgentConfig>;
  rules: {
    package: "@sdb/game-core";
    schemaVersion: string;
  };
  logSchema: {
    schemaVersion: string;
  };
};

export type SimulationSummary = {
  schemaVersion: string;
  completedGames: number;
  failedGames: number;
  averageFinalScore: number;
  winRateByPlayerPosition: Record<string, number>;
  averageFirstLastScoreGap: number;
  level2ReachRate: number;
  level2AverageReachStep: number | null;
  level3ReachRate: number;
  level3AverageReachStep: number | null;
  cardUsesByType: Record<CardType, number>;
  cardUseModeRatios: Record<CardUseMode, number>;
  averageCityCount: number;
  cityBuildsByLevel: Record<1 | 2 | 3, number>;
  averageNeutralAreaCount: number;
};
