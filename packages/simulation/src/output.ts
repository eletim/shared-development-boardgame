import { mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRandomAgents } from "./random-agent";
import { createReplayLog } from "./replay-delta";
import { deriveGameSeeds, simulateGame } from "./runner";
import { createSummary } from "./summary";
import {
  replayLogFormat,
  simulationSchemaVersion,
  type GameRecord,
  type PersistedGameRecord,
  type SimulationMetadata,
  type SimulationRunOptions,
  type SimulationSummaryRecord,
} from "./types";

const safeRunIdPart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, "-");

const replayFileForGame = (gameId: string): string => `replays/${gameId}.jsonl`;

const stripReplayForIndex = (record: GameRecord): PersistedGameRecord => {
  const { replay, ...rest } = record;
  return {
    ...rest,
    replayFormat: replayLogFormat,
    replayFile: replayFileForGame(record.gameId),
    replayStepCount: replay.length,
  } as PersistedGameRecord;
};

const writeReplayFile = async (runDirectory: string, record: GameRecord): Promise<void> => {
  const replayLog = createReplayLog(
    record.gameId,
    record.gameSeed,
    record.replay,
    simulationSchemaVersion
  );
  const lines = [replayLog.header, ...replayLog.steps].map((entry) => JSON.stringify(entry)).join("\n");
  await writeFile(join(runDirectory, replayFileForGame(record.gameId)), `${lines}\n`);
};

export const writeSimulationRun = async (
  options: SimulationRunOptions
): Promise<{ runDirectory: string; records: GameRecord[]; metadata: SimulationMetadata }> => {
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${safeRunIdPart(options.seed)}`;
  const runDirectory = join(options.outputDirectory, runId);
  await mkdir(runDirectory, { recursive: true });
  await mkdir(join(runDirectory, "replays"), { recursive: true });

  const records: GameRecord[] = [];
  const summaryRecords: SimulationSummaryRecord[] = [];
  const agents = createRandomAgents(options.players);
  let completedGames = 0;
  let failedGames = 0;
  const gamesFile = await open(join(runDirectory, "games.jsonl"), "w");
  try {
    const gameSeeds = deriveGameSeeds(options.seed, options.games);
    for (let index = 0; index < gameSeeds.length; index += 1) {
      const gameSeed = gameSeeds[index];
      const record = simulateGame({
        gameId: `game-${String(index + 1).padStart(6, "0")}`,
        gameSeed,
        playerCount: options.players,
        agents,
        maxDecisions: options.maxDecisionsPerGame,
      });
      if (record.status === "completed") completedGames += 1;
      else failedGames += 1;
      await writeReplayFile(runDirectory, record);
      const persisted = stripReplayForIndex(record);
      await gamesFile.writeFile(`${JSON.stringify(persisted)}\n`);
      summaryRecords.push(persisted);
      if (options.retainRecords) records.push(record);
    }
  } finally {
    await gamesFile.close();
  }

  const metadata: SimulationMetadata = {
    schemaVersion: simulationSchemaVersion,
    runId,
    createdAt: new Date().toISOString(),
    requestedGames: options.games,
    completedGames,
    failedGames,
    playerCount: options.players,
    runSeed: options.seed,
    agents,
    rules: {
      package: "@sdb/game-core",
      schemaVersion: "game-core-v1",
    },
    logSchema: {
      schemaVersion: simulationSchemaVersion,
    },
  };

  await writeFile(join(runDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(
    join(runDirectory, "summary.json"),
    `${JSON.stringify(createSummary(summaryRecords, options.players), null, 2)}\n`
  );

  return { runDirectory, records, metadata };
};
