import { type CardType, type CardUseMode } from "@sdb/protocol";
import {
  simulationSchemaVersion,
  type CompletedGameRecord,
  type PersistedCompletedGameRecord,
  type SimulationSummary,
  type SimulationSummaryRecord,
} from "./types";

const cardTypes: CardType[] = [
  "red-production",
  "blue-production",
  "yellow-production",
  "tricolor-city",
  "neutral-development",
];
const cardModes: CardUseMode[] = ["production", "scoring", "basic"];

const emptyCardTypeCounts = (): Record<CardType, number> =>
  Object.fromEntries(cardTypes.map((type) => [type, 0])) as Record<CardType, number>;

const emptyModeValues = (): Record<CardUseMode, number> =>
  Object.fromEntries(cardModes.map((mode) => [mode, 0])) as Record<CardUseMode, number>;

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;

type SummaryCompletedRecord = CompletedGameRecord | PersistedCompletedGameRecord;

const completedOnly = (records: SimulationSummaryRecord[]): SummaryCompletedRecord[] =>
  records.filter((record): record is SummaryCompletedRecord => record.status === "completed");

export const createSummary = (records: SimulationSummaryRecord[], playerCount: number): SimulationSummary => {
  const completed = completedOnly(records);
  const failedCount = records.length - completed.length;
  const scoreValues = completed.flatMap((record) =>
    record.finalScores.map((score) => score.finalScore)
  );
  const firstLastGaps = completed.map((record) => {
    const scores = record.rankings.map((ranking) => ranking.finalScore);
    return scores[0] - scores[scores.length - 1];
  });
  const winsByPosition: Record<string, number> = Object.fromEntries(
    Array.from({ length: playerCount }, (_, index) => [`player-${index + 1}`, 0])
  );
  for (const record of completed) {
    for (const winner of record.winners) {
      winsByPosition[winner] = (winsByPosition[winner] ?? 0) + 1 / record.winners.length;
    }
  }
  for (const playerId of Object.keys(winsByPosition)) {
    winsByPosition[playerId] = completed.length > 0 ? winsByPosition[playerId] / completed.length : 0;
  }

  const cardUses = emptyCardTypeCounts();
  const modeCounts = emptyModeValues();
  const cityBuildsByLevel = { 1: 0, 2: 0, 3: 0 };
  const neutralAreaCounts: number[] = [];
  const level2Steps: number[] = [];
  const level3Steps: number[] = [];
  let totalCityCount = 0;

  for (const record of completed) {
    for (const type of cardTypes) {
      cardUses[type] += record.stats.usedCards[type];
    }
    for (const mode of cardModes) {
      modeCounts[mode] += record.stats.cardUseModes[mode];
    }
    for (const level of [1, 2, 3] as const) {
      cityBuildsByLevel[level] += record.stats.cityBuildsByLevel[level];
    }
    totalCityCount += record.finalCityStacks.reduce(
      (total, intersection) => total + intersection.cityStack.length,
      0
    );
    neutralAreaCounts.push(
      record.finalBoard.filter((area) => area.areaColor === "neutral").length
    );
    const level2 = record.stats.worldLevelUnlocks.find((unlock) => unlock.level === 2);
    const level3 = record.stats.worldLevelUnlocks.find((unlock) => unlock.level === 3);
    if (level2) level2Steps.push(level2.step);
    if (level3) level3Steps.push(level3.step);
  }

  const totalModeCount = Object.values(modeCounts).reduce((total, value) => total + value, 0);
  const modeRatios = emptyModeValues();
  for (const mode of cardModes) {
    modeRatios[mode] = totalModeCount > 0 ? modeCounts[mode] / totalModeCount : 0;
  }

  return {
    schemaVersion: simulationSchemaVersion,
    completedGames: completed.length,
    failedGames: failedCount,
    averageFinalScore: average(scoreValues) ?? 0,
    winRateByPlayerPosition: winsByPosition,
    averageFirstLastScoreGap: average(firstLastGaps) ?? 0,
    level2ReachRate: completed.length > 0 ? level2Steps.length / completed.length : 0,
    level2AverageReachStep: average(level2Steps),
    level3ReachRate: completed.length > 0 ? level3Steps.length / completed.length : 0,
    level3AverageReachStep: average(level3Steps),
    cardUsesByType: cardUses,
    cardUseModeRatios: modeRatios,
    averageCityCount: completed.length > 0 ? totalCityCount / completed.length : 0,
    cityBuildsByLevel,
    averageNeutralAreaCount: average(neutralAreaCounts) ?? 0,
  };
};
