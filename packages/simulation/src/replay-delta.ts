import {
  replayLogFormat,
  type ReplayDeltaStep,
  type ReplayLogHeader,
  type ReplaySnapshot,
  type ReplaySnapshotDelta,
  type ReplaySnapshotDeltaOperation,
  type ReplayStep,
} from "./types";

const clone = <T>(value: T): T => structuredClone(value) as T;

const jsonEquals = (first: unknown, second: unknown): boolean =>
  JSON.stringify(first) === JSON.stringify(second);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const createDelta = (
  before: unknown,
  after: unknown,
  path: Array<string | number> = []
): ReplaySnapshotDelta => {
  if (jsonEquals(before, after)) return [];

  if (Array.isArray(before) && Array.isArray(after)) {
    const operations: ReplaySnapshotDelta = [];
    const commonLength = Math.min(before.length, after.length);
    for (let index = 0; index < commonLength; index += 1) {
      operations.push(...createDelta(before[index], after[index], [...path, index]));
    }
    for (let index = before.length - 1; index >= after.length; index -= 1) {
      operations.push({ op: "remove", path: [...path, index] });
    }
    for (let index = before.length; index < after.length; index += 1) {
      operations.push({ op: "add", path: [...path, index], value: clone(after[index]) });
    }
    return operations;
  }

  if (isRecord(before) && isRecord(after)) {
    const operations: ReplaySnapshotDelta = [];
    for (const key of Object.keys(before).filter((key) => !(key in after)).sort()) {
      operations.push({ op: "remove", path: [...path, key] });
    }
    for (const key of Object.keys(after).sort()) {
      if (!(key in before)) {
        operations.push({ op: "add", path: [...path, key], value: clone(after[key]) });
      } else {
        operations.push(...createDelta(before[key], after[key], [...path, key]));
      }
    }
    return operations;
  }

  return [{ op: "replace", path, value: clone(after) }];
};

const parentAtPath = (root: unknown, path: Array<string | number>): unknown => {
  let current = root;
  for (const part of path.slice(0, -1)) {
    if (typeof current !== "object" || current === null) {
      throw new Error(`Cannot apply replay delta at ${path.join(".")}`);
    }
    current = (current as Record<string, unknown> | unknown[])[part as never];
  }
  return current;
};

export const applySnapshotDelta = (
  snapshot: ReplaySnapshot,
  delta: ReplaySnapshotDelta
): ReplaySnapshot => {
  const next = clone(snapshot);
  for (const operation of delta) {
    applyOperation(next, operation);
  }
  return next;
};

const applyOperation = (snapshot: ReplaySnapshot, operation: ReplaySnapshotDeltaOperation): void => {
  const parent = parentAtPath(snapshot, operation.path);
  const key = operation.path[operation.path.length - 1];
  if (key === undefined) {
    throw new Error("Replay delta cannot replace the snapshot root.");
  }
  if (Array.isArray(parent) && typeof key === "number") {
    if (operation.op === "remove") parent.splice(key, 1);
    else if (operation.op === "add") parent.splice(key, 0, clone(operation.value));
    else parent[key] = clone(operation.value);
    return;
  }
  if (!isRecord(parent) || typeof key !== "string") {
    throw new Error(`Cannot apply replay delta at ${operation.path.join(".")}`);
  }
  if (operation.op === "remove") delete parent[key];
  else parent[key] = clone(operation.value);
};

export const createReplayLog = (
  gameId: string,
  gameSeed: string,
  replay: ReplayStep[],
  schemaVersion: string
): { header: ReplayLogHeader; steps: ReplayDeltaStep[] } => {
  if (replay.length === 0) {
    throw new Error(`Cannot create replay log for ${gameId}: replay is empty.`);
  }

  let previousSnapshot = replay[0].snapshot;
  const steps = replay.map((step, index) => {
    const stateDelta = index === 0 ? createDelta(previousSnapshot, step.snapshot) : createDelta(previousSnapshot, step.snapshot);
    previousSnapshot = step.snapshot;
    return {
      kind: "step" as const,
      step: step.step,
      eventType: step.eventType,
      round: step.round,
      playerId: step.playerId,
      action: clone(step.action),
      details: clone(step.details),
      stateDelta,
    };
  });

  return {
    header: {
      schemaVersion,
      kind: "replay",
      format: replayLogFormat,
      gameId,
      gameSeed,
      initialSnapshot: clone(replay[0].snapshot),
    },
    steps,
  };
};

export const expandReplayLog = (
  header: ReplayLogHeader,
  steps: ReplayDeltaStep[]
): ReplayStep[] => {
  let snapshot = clone(header.initialSnapshot);
  return steps.map((step, index) => {
    if (step.kind !== "step" || step.step !== index) {
      throw new Error(`Invalid replay step order for ${header.gameId} at index ${index}.`);
    }
    snapshot = applySnapshotDelta(snapshot, step.stateDelta);
    return {
      step: step.step,
      eventType: step.eventType,
      round: step.round,
      playerId: step.playerId,
      action: clone(step.action),
      details: clone(step.details),
      snapshot: clone(snapshot),
    };
  });
};
