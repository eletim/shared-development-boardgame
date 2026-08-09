import { writeSimulationRun } from "./output";

type CliOptions = {
  games: number;
  players: number;
  seed: string;
  outputDirectory: string;
};

const usage = "Usage: pnpm simulate --games 1000 --players 4 --seed 1234 --output-dir simulation-results";

const readOption = (args: string[], name: string): string | null => {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
};

const parsePositiveInteger = (value: string | null, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

export const parseArgs = (args: string[]): CliOptions => {
  if (args.includes("--help") || args.includes("-h")) {
    throw new Error(usage);
  }
  const games = parsePositiveInteger(readOption(args, "--games") ?? "1", "games");
  const players = parsePositiveInteger(readOption(args, "--players") ?? "4", "players");
  if (players < 2 || players > 4) throw new Error("players must be between 2 and 4");
  return {
    games,
    players,
    seed: readOption(args, "--seed") ?? "default-seed",
    outputDirectory: readOption(args, "--output-dir") ?? "simulation-results",
  };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const { runDirectory, metadata } = await writeSimulationRun(options);
  console.log(
    JSON.stringify(
      {
        runDirectory,
        requestedGames: metadata.requestedGames,
        completedGames: metadata.completedGames,
        failedGames: metadata.failedGames,
      },
      null,
      2
    )
  );
  if (metadata.failedGames > 0) process.exitCode = 1;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
