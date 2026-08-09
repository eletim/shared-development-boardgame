import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  expandReplayLog,
  replayLogFormat,
  simulationSchemaVersion,
  type GameRecord,
  type PersistedCompletedGameRecord,
  type PersistedGameRecord,
  type ReplayDeltaStep,
  type ReplayLogHeader,
  type ReplayStep,
  type SimulationMetadata,
  type SimulationSummary,
} from "@sdb/simulation";
import { type AreaColor, type CardType, type CardUseMode } from "@sdb/protocol";

export class SimulationDataError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "SimulationDataError";
    this.statusCode = statusCode;
  }
}

const cardTypes: CardType[] = [
  "red-production",
  "blue-production",
  "yellow-production",
  "tricolor-city",
  "neutral-development",
];
const cardModes: CardUseMode[] = ["production", "scoring", "basic"];
const areaColors: AreaColor[] = ["red", "blue", "yellow", "neutral"];
const cityLevels = [1, 2, 3] as const;

const emptyModeCounts = (): Record<CardUseMode, number> =>
  Object.fromEntries(cardModes.map((mode) => [mode, 0])) as Record<CardUseMode, number>;

const emptyAreaColorCounts = (): Record<AreaColor, number> =>
  Object.fromEntries(areaColors.map((color) => [color, 0])) as Record<AreaColor, number>;

const emptyAreaLevelCounts = (): Record<0 | 1 | 2 | 3, number> => ({ 0: 0, 1: 0, 2: 0, 3: 0 });
const emptyCityLevelCounts = (): Record<1 | 2 | 3, number> => ({ 1: 0, 2: 0, 3: 0 });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertSchema = (schemaVersion: unknown, label: string): void => {
  if (schemaVersion !== simulationSchemaVersion) {
    throw new SimulationDataError(
      `${label} has unsupported schemaVersion "${String(schemaVersion)}"; supported schemaVersion is "${simulationSchemaVersion}".`
    );
  }
};

const parseJsonFile = async <T>(filePath: string, label: string): Promise<T> => {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    const code = isObject(error) ? error.code : undefined;
    if (code === "ENOENT") {
      throw new SimulationDataError(`Missing required simulation file: ${label}`, 404);
    }
    throw error;
  }

  try {
    return JSON.parse(source) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SimulationDataError(`Invalid JSON in ${label}: ${message}`);
  }
};

const parseJsonlFile = async <T>(filePath: string, label: string): Promise<T[]> => {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    const code = isObject(error) ? error.code : undefined;
    if (code === "ENOENT") {
      throw new SimulationDataError(`Missing required simulation file: ${label}`, 404);
    }
    throw error;
  }

  const rows: T[] = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SimulationDataError(`Invalid JSONL in ${label} at line ${index + 1}: ${message}`);
    }
  }
  return rows;
};

const assertRunId = (runId: string): void => {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
    throw new SimulationDataError("Invalid simulation runId.", 400);
  }
};

const assertReplayFormat = (format: unknown, label: string): void => {
  if (format !== replayLogFormat) {
    throw new SimulationDataError(
      `${label} has unsupported replay format "${String(format)}"; supported replay format is "${replayLogFormat}".`
    );
  }
};

export const resolveSimulationResultsDirectory = async (configured?: string): Promise<string> => {
  const candidates = configured
    ? [configured]
    : [
        resolve(process.cwd(), "simulation-results"),
        resolve(process.cwd(), "../../simulation-results"),
      ];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) return candidate;
    } catch {
      // Try the next conventional location.
    }
  }
  return candidates[0];
};

const runDirectory = async (baseDirectory: string, runId: string): Promise<string> => {
  assertRunId(runId);
  const base = await realpath(baseDirectory).catch(() => resolve(baseDirectory));
  const target = resolve(base, runId);
  if (!target.startsWith(`${base}/`) && target !== base) {
    throw new SimulationDataError("Invalid simulation runId.", 400);
  }
  const actualTarget = await realpath(target).catch(() => target);
  if (!actualTarget.startsWith(`${base}/`) && actualTarget !== base) {
    throw new SimulationDataError("Invalid simulation runId.", 400);
  }
  return actualTarget;
};

const readMetadataUnchecked = async (directory: string): Promise<SimulationMetadata> =>
  await parseJsonFile<SimulationMetadata>(join(directory, "metadata.json"), "metadata.json");

const readMetadata = async (directory: string): Promise<SimulationMetadata> => {
  const metadata = await readMetadataUnchecked(directory);
  assertSchema(metadata.schemaVersion, "metadata.json");
  return metadata;
};

const readSummary = async (directory: string): Promise<SimulationSummary> => {
  const summary = await parseJsonFile<SimulationSummary>(join(directory, "summary.json"), "summary.json");
  assertSchema(summary.schemaVersion, "summary.json");
  return summary;
};

const readGames = async (directory: string): Promise<PersistedGameRecord[]> => {
  const games = await parseJsonlFile<PersistedGameRecord>(join(directory, "games.jsonl"), "games.jsonl");
  for (const game of games) {
    assertSchema(isObject(game) ? game.schemaVersion : undefined, `games.jsonl game ${isObject(game) && typeof game.gameId === "string" ? game.gameId : ""}`.trim());
    assertReplayFormat(isObject(game) ? game.replayFormat : undefined, `games.jsonl game ${isObject(game) && typeof game.gameId === "string" ? game.gameId : ""}`.trim());
    if (!isObject(game) || typeof game.replayFile !== "string") {
      throw new SimulationDataError("games.jsonl contains a game without replayFile.");
    }
    if ("replay" in game) {
      throw new SimulationDataError("games.jsonl must not embed replay steps for the current schema.");
    }
  }
  return games;
};

const replayFilePath = (directory: string, replayFile: string): string => {
  if (isAbsolute(replayFile)) {
    throw new SimulationDataError("Invalid replay file path.", 400);
  }
  const target = resolve(directory, replayFile);
  const base = resolve(directory);
  if (!target.startsWith(`${base}/`) && target !== base) {
    throw new SimulationDataError("Invalid replay file path.", 400);
  }
  return target;
};

const readReplay = async (
  directory: string,
  game: PersistedGameRecord
): Promise<ReplayStep[]> => {
  const rows = await parseJsonlFile<ReplayLogHeader | ReplayDeltaStep>(
    replayFilePath(directory, game.replayFile),
    game.replayFile
  );
  const [header, ...steps] = rows;
  if (!isObject(header) || header.kind !== "replay") {
    throw new SimulationDataError(`${game.replayFile} is missing a replay header.`);
  }
  assertSchema(header.schemaVersion, `${game.replayFile} header`);
  assertReplayFormat(header.format, `${game.replayFile} header`);
  if (header.gameId !== game.gameId || header.gameSeed !== game.gameSeed) {
    throw new SimulationDataError(`${game.replayFile} does not match games.jsonl metadata.`);
  }
  try {
    const replay = expandReplayLog(header, steps as ReplayDeltaStep[]);
    if (replay.length !== game.replayStepCount) {
      throw new Error(`expected ${game.replayStepCount} steps, got ${replay.length}`);
    }
    return replay;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SimulationDataError(`Invalid replay delta log in ${game.replayFile}: ${message}`);
  }
};

export type SimulationRunListItem = {
  runId: string;
  createdAt: string;
  gameCount: number;
  completedGames: number;
  failedGames: number;
  playerCount: number;
  runSeed: string;
  agents: SimulationMetadata["agents"];
  schemaVersion: string;
};

export type ScoreStatistics = {
  averageFinalScore: number;
  medianFinalScore: number;
  scoreDistribution: { bucket: string; count: number }[];
  averageFirstLastScoreGap: number;
  winRateByPlayerIndex: Record<string, number>;
  averageRankByPlayerIndex: Record<string, number>;
};

export type LevelStatistics = {
  level: 2 | 3;
  reachRate: number;
  averageReachRound: number | null;
  averageReachStep: number | null;
  timingDistribution: { round: number; count: number }[];
  unlockPlayerIndexDistribution: Record<string, number>;
};

export type CardStatistics = {
  type: CardType;
  draftCount: number;
  useCount: number;
  actionUseCount: number;
  scoringUseCount: number;
  basicUseCount: number;
  modeRatios: Record<CardUseMode, number>;
  drafterAverageFinalScore: number | null;
  drafterAverageRank: number | null;
  drafterWinRate: number | null;
  tricolorBonusCount?: number;
  tricolorBonusRate?: number | null;
  neutralDevelopmentBonusCount?: number;
  neutralDevelopmentAverageBonusCubes?: number | null;
  neutralDevelopmentMaxBonusCubes?: number;
};

export type CityStatistics = {
  averageCityPiecesPerGame: number;
  averageBuildsByLevel: Record<1 | 2 | 3, number>;
  emptyIntersectionBuilds: number;
  stackedCityBuilds: number;
  stackingRate: number;
  winnerAverageCityCount: number | null;
  winnerAverageCitiesByLevel: Record<1 | 2 | 3, number>;
};

export type AreaStatistics = {
  finalAverageAreaCounts: Record<AreaColor, number>;
  roundEndColorDistribution: { round: number; colors: Record<AreaColor, number> }[];
  roundEndAreaLevelDistribution: { round: number; levels: Record<0 | 1 | 2 | 3, number> }[];
  neutralAreaTrend: { round: number; averageNeutralAreas: number }[];
  colorChangeCount: null;
  neutralizationCount: null;
};

export type GameListItem = {
  gameId: string;
  gameSeed: string;
  status: GameRecord["status"];
  finalScores: { playerId: string; score: number; rank: number }[];
  winners: string[];
  level2Timing: { round: number; step: number; playerId: string } | null;
  level3Timing: { round: number; step: number; playerId: string } | null;
  finalWorldLevel: 1 | 2 | 3 | null;
  scoreGap: number | null;
  tags: string[];
};

export type SimulationRunAnalysis = {
  score: ScoreStatistics;
  levels: { level2: LevelStatistics; level3: LevelStatistics };
  cards: CardStatistics[];
  cities: CityStatistics;
  areas: AreaStatistics;
};

export type SimulationRunDetails = {
  metadata: SimulationMetadata;
  summary: SimulationSummary;
  analysis: SimulationRunAnalysis;
  games: GameListItem[];
};

const completedOnly = (records: PersistedGameRecord[]): PersistedCompletedGameRecord[] =>
  records.filter((record): record is PersistedCompletedGameRecord => record.status === "completed");

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const scoreDistribution = (values: number[]): { bucket: string; count: number }[] => {
  if (values.length === 0) return [];
  const bucketSize = 5;
  const min = Math.floor(Math.min(...values) / bucketSize) * bucketSize;
  const max = Math.floor(Math.max(...values) / bucketSize) * bucketSize;
  return Array.from({ length: (max - min) / bucketSize + 1 }, (_, index) => {
    const start = min + index * bucketSize;
    const end = start + bucketSize - 1;
    return {
      bucket: `${start}-${end}`,
      count: values.filter((value) => value >= start && value <= end).length,
    };
  });
};

const playerIndexes = (playerCount: number): string[] =>
  Array.from({ length: playerCount }, (_, index) => `player-${index + 1}`);

const computeScoreStats = (completed: PersistedCompletedGameRecord[], playerCount: number): ScoreStatistics => {
  const scores = completed.flatMap((record) => record.finalScores.map((score) => score.finalScore));
  const wins: Record<string, number> = Object.fromEntries(playerIndexes(playerCount).map((id) => [id, 0]));
  const rankTotals: Record<string, number> = Object.fromEntries(playerIndexes(playerCount).map((id) => [id, 0]));
  const rankCounts: Record<string, number> = Object.fromEntries(playerIndexes(playerCount).map((id) => [id, 0]));
  const gaps: number[] = [];

  for (const record of completed) {
    for (const winner of record.winners) {
      wins[winner] = (wins[winner] ?? 0) + 1 / record.winners.length;
    }
    for (const result of record.finalScores) {
      rankTotals[result.playerId] = (rankTotals[result.playerId] ?? 0) + result.rank;
      rankCounts[result.playerId] = (rankCounts[result.playerId] ?? 0) + 1;
    }
    if (record.rankings.length > 0) {
      gaps.push(record.rankings[0].finalScore - record.rankings[record.rankings.length - 1].finalScore);
    }
  }

  return {
    averageFinalScore: average(scores) ?? 0,
    medianFinalScore: median(scores),
    scoreDistribution: scoreDistribution(scores),
    averageFirstLastScoreGap: average(gaps) ?? 0,
    winRateByPlayerIndex: Object.fromEntries(
      playerIndexes(playerCount).map((id) => [id, completed.length > 0 ? (wins[id] ?? 0) / completed.length : 0])
    ),
    averageRankByPlayerIndex: Object.fromEntries(
      playerIndexes(playerCount).map((id) => [id, rankCounts[id] > 0 ? rankTotals[id] / rankCounts[id] : 0])
    ),
  };
};

const computeLevelStats = (completed: PersistedCompletedGameRecord[], playerCount: number, level: 2 | 3): LevelStatistics => {
  const unlocks = completed
    .map((record) => record.stats.worldLevelUnlocks.find((unlock) => unlock.level === level) ?? null)
    .filter((unlock): unlock is NonNullable<typeof unlock> => unlock !== null);
  const roundCounts = new Map<number, number>();
  const playerCounts: Record<string, number> = Object.fromEntries(playerIndexes(playerCount).map((id) => [id, 0]));
  for (const unlock of unlocks) {
    roundCounts.set(unlock.round, (roundCounts.get(unlock.round) ?? 0) + 1);
    playerCounts[unlock.playerId] = (playerCounts[unlock.playerId] ?? 0) + 1;
  }
  return {
    level,
    reachRate: completed.length > 0 ? unlocks.length / completed.length : 0,
    averageReachRound: average(unlocks.map((unlock) => unlock.round)),
    averageReachStep: average(unlocks.map((unlock) => unlock.step)),
    timingDistribution: [...roundCounts.entries()]
      .sort(([first], [second]) => first - second)
      .map(([round, count]) => ({ round, count })),
    unlockPlayerIndexDistribution: playerCounts,
  };
};

const computeCardStats = (completed: PersistedCompletedGameRecord[]): CardStatistics[] => {
  const cardRows = new Map<CardType, {
    draftCount: number;
    useCount: number;
    modes: Record<CardUseMode, number>;
    drafterGamePlayers: Set<string>;
    drafterScores: number[];
    drafterRanks: number[];
    drafterWins: number;
    tricolorBonusCount: number;
    neutralBonusCount: number;
    neutralBonusCubeTotals: number[];
  }>();
  for (const type of cardTypes) {
    cardRows.set(type, {
      draftCount: 0,
      useCount: 0,
      modes: emptyModeCounts(),
      drafterGamePlayers: new Set(),
      drafterScores: [],
      drafterRanks: [],
      drafterWins: 0,
      tricolorBonusCount: 0,
      neutralBonusCount: 0,
      neutralBonusCubeTotals: [],
    });
  }

  for (const record of completed) {
    const results = new Map(record.finalScores.map((result) => [result.playerId, result]));
    const winners = new Set(record.winners);
    for (const type of cardTypes) {
      const row = cardRows.get(type)!;
      row.draftCount += record.stats.draftedCards[type] ?? 0;
      row.useCount += record.stats.usedCards[type] ?? 0;
    }
    for (const type of cardTypes) {
      const row = cardRows.get(type)!;
      const drafters = record.stats.draftedCardsByPlayer[type] ?? {};
      for (const playerId of Object.keys(drafters)) {
        const key = `${record.gameId}:${type}:${playerId}`;
        if (row.drafterGamePlayers.has(key)) continue;
        row.drafterGamePlayers.add(key);
        const result = results.get(playerId);
        if (!result) continue;
        row.drafterScores.push(result.finalScore);
        row.drafterRanks.push(result.rank);
        if (winners.has(playerId)) row.drafterWins += 1 / record.winners.length;
      }
    }
    for (const type of cardTypes) {
      const row = cardRows.get(type)!;
      for (const mode of cardModes) {
        row.modes[mode] += record.stats.cardUseModesByType[type]?.[mode] ?? 0;
      }
    }
    cardRows.get("tricolor-city")!.tricolorBonusCount += record.stats.tricolorBonusCount;
    cardRows.get("neutral-development")!.neutralBonusCount += record.stats.neutralDevelopmentBonusCount;
    for (const total of record.stats.neutralDevelopmentBonusCubeTotals ?? []) {
      if (total > 0) cardRows.get("neutral-development")!.neutralBonusCubeTotals.push(total);
    }
  }

  return cardTypes.map((type) => {
    const row = cardRows.get(type)!;
    const modeRatios = emptyModeCounts();
    for (const mode of cardModes) {
      modeRatios[mode] = row.useCount > 0 ? row.modes[mode] / row.useCount : 0;
    }
    const output: CardStatistics = {
      type,
      draftCount: row.draftCount,
      useCount: row.useCount,
      actionUseCount: row.modes.production,
      scoringUseCount: row.modes.scoring,
      basicUseCount: row.modes.basic,
      modeRatios,
      drafterAverageFinalScore: average(row.drafterScores),
      drafterAverageRank: average(row.drafterRanks),
      drafterWinRate: row.drafterGamePlayers.size > 0 ? row.drafterWins / row.drafterGamePlayers.size : null,
    };
    if (type === "tricolor-city") {
      output.tricolorBonusCount = row.tricolorBonusCount;
      output.tricolorBonusRate = row.modes.production > 0 ? row.tricolorBonusCount / row.modes.production : null;
    }
    if (type === "neutral-development") {
      output.neutralDevelopmentBonusCount = row.neutralBonusCount;
      output.neutralDevelopmentAverageBonusCubes = average(row.neutralBonusCubeTotals);
      output.neutralDevelopmentMaxBonusCubes = row.neutralBonusCubeTotals.length > 0 ? Math.max(...row.neutralBonusCubeTotals) : 0;
    }
    return output;
  });
};

const computeCityStats = (completed: PersistedCompletedGameRecord[]): CityStatistics => {
  const buildsByLevel = emptyCityLevelCounts();
  const winnerCityCounts: number[] = [];
  const winnerCityLevels = emptyCityLevelCounts();
  let totalCityPieces = 0;
  let emptyBuilds = 0;
  let stackedBuilds = 0;

  for (const record of completed) {
    totalCityPieces += record.finalCityStacks.reduce((total, intersection) => total + intersection.cityStack.length, 0);
    for (const level of cityLevels) {
      buildsByLevel[level] += record.stats.cityBuildsByLevel[level] ?? 0;
    }
    emptyBuilds += record.stats.emptyIntersectionBuilds;
    stackedBuilds += record.stats.stackedCityBuilds;
    const winners = new Set(record.winners);
    for (const result of record.finalScores) {
      if (winners.has(result.playerId)) winnerCityCounts.push(result.cityCount);
    }
    for (const intersection of record.finalCityStacks) {
      for (const city of intersection.cityStack) {
        if (winners.has(city.playerId)) winnerCityLevels[city.level] += 1;
      }
    }
  }

  const winnerCount = winnerCityCounts.length;
  return {
    averageCityPiecesPerGame: completed.length > 0 ? totalCityPieces / completed.length : 0,
    averageBuildsByLevel: Object.fromEntries(
      cityLevels.map((level) => [level, completed.length > 0 ? buildsByLevel[level] / completed.length : 0])
    ) as Record<1 | 2 | 3, number>,
    emptyIntersectionBuilds: emptyBuilds,
    stackedCityBuilds: stackedBuilds,
    stackingRate: emptyBuilds + stackedBuilds > 0 ? stackedBuilds / (emptyBuilds + stackedBuilds) : 0,
    winnerAverageCityCount: average(winnerCityCounts),
    winnerAverageCitiesByLevel: Object.fromEntries(
      cityLevels.map((level) => [level, winnerCount > 0 ? winnerCityLevels[level] / winnerCount : 0])
    ) as Record<1 | 2 | 3, number>,
  };
};

const computeAreaStats = (completed: PersistedCompletedGameRecord[]): AreaStatistics => {
  const finalTotals = emptyAreaColorCounts();
  const roundColorTotals = new Map<number, Record<AreaColor, number>>();
  const roundLevelTotals = new Map<number, Record<0 | 1 | 2 | 3, number>>();
  const neutralRoundTotals = new Map<number, { total: number; count: number }>();

  for (const record of completed) {
    for (const area of record.finalBoard) {
      finalTotals[area.areaColor] += 1;
    }
    for (const roundStats of record.stats.roundEndAreaStats) {
      const colorCounts = roundColorTotals.get(roundStats.round) ?? emptyAreaColorCounts();
      const levelCounts = roundLevelTotals.get(roundStats.round) ?? emptyAreaLevelCounts();
      for (const area of roundStats.areas) {
        colorCounts[area.color] += 1;
        levelCounts[area.areaLevel] += 1;
      }
      roundColorTotals.set(roundStats.round, colorCounts);
      roundLevelTotals.set(roundStats.round, levelCounts);
      const neutral = neutralRoundTotals.get(roundStats.round) ?? { total: 0, count: 0 };
      neutral.total += roundStats.neutralAreaCount;
      neutral.count += 1;
      neutralRoundTotals.set(roundStats.round, neutral);
    }
  }

  return {
    finalAverageAreaCounts: Object.fromEntries(
      areaColors.map((color) => [color, completed.length > 0 ? finalTotals[color] / completed.length : 0])
    ) as Record<AreaColor, number>,
    roundEndColorDistribution: [...roundColorTotals.entries()]
      .sort(([first], [second]) => first - second)
      .map(([round, colors]) => ({ round, colors })),
    roundEndAreaLevelDistribution: [...roundLevelTotals.entries()]
      .sort(([first], [second]) => first - second)
      .map(([round, levels]) => ({ round, levels })),
    neutralAreaTrend: [...neutralRoundTotals.entries()]
      .sort(([first], [second]) => first - second)
      .map(([round, value]) => ({ round, averageNeutralAreas: value.count > 0 ? value.total / value.count : 0 })),
    colorChangeCount: null,
    neutralizationCount: null,
  };
};

const gameListItem = (record: PersistedGameRecord): GameListItem => {
  if (record.status === "failed") {
    return {
      gameId: record.gameId,
      gameSeed: record.gameSeed,
      status: record.status,
      finalScores: [],
      winners: [],
      level2Timing: null,
      level3Timing: null,
      finalWorldLevel: null,
      scoreGap: null,
      tags: ["failed"],
    };
  }
  const level2 = record.stats.worldLevelUnlocks.find((unlock) => unlock.level === 2) ?? null;
  const level3 = record.stats.worldLevelUnlocks.find((unlock) => unlock.level === 3) ?? null;
  const gap = record.rankings.length > 0
    ? record.rankings[0].finalScore - record.rankings[record.rankings.length - 1].finalScore
    : null;
  const tags = [
    gap !== null && gap >= 20 ? "large-gap" : null,
    gap !== null && gap <= 5 ? "close" : null,
    level3 === null ? "no-lv3" : null,
    level3 !== null && level3.round <= 2 ? "early-lv3" : null,
  ].filter((tag): tag is string => tag !== null);
  return {
    gameId: record.gameId,
    gameSeed: record.gameSeed,
    status: record.status,
    finalScores: record.finalScores.map((result) => ({
      playerId: result.playerId,
      score: result.finalScore,
      rank: result.rank,
    })),
    winners: record.winners,
    level2Timing: level2 ? { round: level2.round, step: level2.step, playerId: level2.playerId } : null,
    level3Timing: level3 ? { round: level3.round, step: level3.step, playerId: level3.playerId } : null,
    finalWorldLevel: record.finalWorldLevel,
    scoreGap: gap,
    tags,
  };
};

export const analyzeSimulationRun = (records: PersistedGameRecord[], playerCount: number): SimulationRunAnalysis => {
  const completed = completedOnly(records);
  return {
    score: computeScoreStats(completed, playerCount),
    levels: {
      level2: computeLevelStats(completed, playerCount, 2),
      level3: computeLevelStats(completed, playerCount, 3),
    },
    cards: computeCardStats(completed),
    cities: computeCityStats(completed),
    areas: computeAreaStats(completed),
  };
};

export const listSimulationRuns = async (baseDirectory: string): Promise<SimulationRunListItem[]> => {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = await readdir(baseDirectory, { withFileTypes: true });
  } catch (error) {
    const code = isObject(error) ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
  const runs: SimulationRunListItem[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = join(baseDirectory, entry.name);
    const metadata = await readMetadataUnchecked(directory);
    runs.push({
      runId: metadata.runId,
      createdAt: metadata.createdAt,
      gameCount: metadata.completedGames + metadata.failedGames,
      completedGames: metadata.completedGames,
      failedGames: metadata.failedGames,
      playerCount: metadata.playerCount,
      runSeed: metadata.runSeed,
      agents: metadata.agents,
      schemaVersion: metadata.schemaVersion,
    });
  }
  return runs.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
};

export const loadSimulationRun = async (baseDirectory: string, runId: string): Promise<SimulationRunDetails> => {
  const directory = await runDirectory(baseDirectory, runId);
  const metadata = await readMetadata(directory);
  const summary = await readSummary(directory);
  const games = await readGames(directory);
  return {
    metadata,
    summary,
    analysis: analyzeSimulationRun(games, metadata.playerCount),
    games: games.map(gameListItem),
  };
};

export const loadSimulationGame = async (baseDirectory: string, runId: string, gameId: string): Promise<GameRecord> => {
  const directory = await runDirectory(baseDirectory, runId);
  await readMetadata(directory);
  await readSummary(directory);
  const games = await readGames(directory);
  const game = games.find((record) => record.gameId === gameId || record.gameSeed === gameId);
  if (!game) throw new SimulationDataError(`Simulation game not found: ${gameId}`, 404);
  const record: Partial<PersistedGameRecord> = { ...game };
  delete record.replayFile;
  delete record.replayFormat;
  delete record.replayStepCount;
  return {
    ...record,
    replay: await readReplay(directory, game),
  } as GameRecord;
};
