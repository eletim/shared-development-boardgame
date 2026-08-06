import {
  type ActionLogEntry,
  type CubeColor,
  type CubeCounts,
  cubeColors,
  type GameAction,
  type LegalInfo,
  type PartialCubeCounts,
  type PublicGameState,
} from "@sdb/protocol";

export { cubeColors };
export type { CubeColor, CubeCounts, GameAction, PublicGameState };

const totalCubesPerColor = 15;
const maxHandSize = 10;
const maxRounds = 12;
const hexSize = 86;
const playerColors = ["#d73a31", "#1f6feb", "#2da44e", "#b7791f"];

export type AreaState = {
  id: string;
  label: string;
  q: number;
  r: number;
  x: number;
  y: number;
  cubes: CubeCounts;
};

export type IntersectionState = {
  id: string;
  x: number;
  y: number;
  adjacentAreaIds: string[];
  city: { playerId: string } | null;
};

export type PlayerState = {
  id: string;
  name: string;
  color: string;
  hand: CubeCounts;
  turnsTaken: number;
};

export type GameState = {
  status: "active" | "ended";
  round: number;
  maxRounds: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  supply: CubeCounts;
  areas: AreaState[];
  intersections: IntersectionState[];
  history: ActionLogEntry[];
  nextHistoryId: number;
};

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: string };

export type BoardDefinition = {
  areas: AreaState[];
  intersections: IntersectionState[];
};

const emptyCubes = (): CubeCounts => ({ red: 0, blue: 0, yellow: 0 });

const fullSupply = (): CubeCounts => ({
  red: totalCubesPerColor,
  blue: totalCubesPerColor,
  yellow: totalCubesPerColor,
});

const cubeTotal = (cubes: PartialCubeCounts): number =>
  cubeColors.reduce((total, color) => total + (cubes[color] ?? 0), 0);

const normalizeCubes = (cubes: PartialCubeCounts): CubeCounts => ({
  red: cubes.red ?? 0,
  blue: cubes.blue ?? 0,
  yellow: cubes.yellow ?? 0,
});

const cloneState = (state: GameState): GameState =>
  structuredClone(state) as GameState;

const areaTotal = (area: AreaState): number => cubeTotal(area.cubes);

const currentPlayer = (state: GameState): PlayerState =>
  state.players[state.currentPlayerIndex];

const cityCountForPlayer = (state: GameState, playerId: string): number =>
  state.intersections.filter((intersection) => intersection.city?.playerId === playerId).length;

export const getPhase = (state: GameState): 1 | 2 | 3 => {
  const cities = state.intersections.filter((intersection) => intersection.city).length;
  if (cities >= 8) return 3;
  if (cities >= 4) return 2;
  return 1;
};

export const getAreaCapacity = (state: GameState): number => {
  const phase = getPhase(state);
  if (phase === 1) return 3;
  if (phase === 2) return 5;
  return 7;
};

export const createBoardDefinition = (): BoardDefinition => {
  const axialAreas = [
    { id: "area-center", label: "中央", q: 0, r: 0 },
    { id: "area-east", label: "東", q: 1, r: 0 },
    { id: "area-northeast", label: "北東", q: 1, r: -1 },
    { id: "area-northwest", label: "北西", q: 0, r: -1 },
    { id: "area-west", label: "西", q: -1, r: 0 },
    { id: "area-southwest", label: "南西", q: -1, r: 1 },
    { id: "area-southeast", label: "南東", q: 0, r: 1 },
  ];

  const areas: AreaState[] = axialAreas.map((area) => {
    const x = hexSize * Math.sqrt(3) * (area.q + area.r / 2);
    const y = hexSize * 1.5 * area.r;
    return { ...area, x, y, cubes: emptyCubes() };
  });

  const byCorner = new Map<
    string,
    { x: number; y: number; adjacentAreaIds: Set<string> }
  >();

  for (const area of areas) {
    for (let vertex = 0; vertex < 6; vertex += 1) {
      const angle = ((30 + vertex * 60) * Math.PI) / 180;
      const x = area.x + hexSize * Math.cos(angle);
      const y = area.y + hexSize * Math.sin(angle);
      const key = `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
      const existing = byCorner.get(key);
      if (existing) {
        existing.adjacentAreaIds.add(area.id);
      } else {
        byCorner.set(key, { x, y, adjacentAreaIds: new Set([area.id]) });
      }
    }
  }

  const intersections = [...byCorner.values()]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((corner, index): IntersectionState => ({
      id: `intersection-${String(index + 1).padStart(2, "0")}`,
      x: Math.round(corner.x * 100) / 100,
      y: Math.round(corner.y * 100) / 100,
      adjacentAreaIds: [...corner.adjacentAreaIds].sort(),
      city: null,
    }));

  return { areas, intersections };
};

export const createInitialState = (playerNames: string[]): GameState => {
  const names = playerNames.map((name) => name.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 4) {
    throw new Error("プレイヤー人数は2〜4人にしてください。");
  }

  const board = createBoardDefinition();
  return {
    status: "active",
    round: 1,
    maxRounds,
    currentPlayerIndex: 0,
    players: names.map((name, index) => ({
      id: `player-${index + 1}`,
      name,
      color: playerColors[index],
      hand: emptyCubes(),
      turnsTaken: 0,
    })),
    supply: fullSupply(),
    areas: board.areas,
    intersections: board.intersections,
    history: [],
    nextHistoryId: 1,
  };
};

export const validateCubeTotals = (state: GameState): boolean =>
  cubeColors.every((color) => {
    const inHands = state.players.reduce((total, player) => total + player.hand[color], 0);
    const onBoard = state.areas.reduce((total, area) => total + area.cubes[color], 0);
    return state.supply[color] + inHands + onBoard === totalCubesPerColor;
  });

const validateCubeInput = (cubes: PartialCubeCounts): string | null => {
  for (const color of cubeColors) {
    const value = cubes[color] ?? 0;
    if (!Number.isInteger(value) || value < 0) {
      return "キューブ数は0以上の整数で指定してください。";
    }
  }
  return null;
};

const advanceTurn = (state: GameState): void => {
  const player = currentPlayer(state);
  player.turnsTaken += 1;

  const everyoneFinished = state.players.every(
    (candidate) => candidate.turnsTaken >= state.maxRounds
  );
  if (everyoneFinished) {
    state.status = "ended";
    return;
  }

  if (state.currentPlayerIndex === state.players.length - 1) {
    state.round += 1;
    state.currentPlayerIndex = 0;
  } else {
    state.currentPlayerIndex += 1;
  }
};

const addHistory = (state: GameState, action: GameAction, summary: string): void => {
  const player = state.players.find((candidate) => candidate.id === action.playerId);
  state.history.unshift({
    id: state.nextHistoryId,
    round: state.round,
    playerId: action.playerId,
    playerName: player?.name ?? action.playerId,
    type: action.type,
    summary,
  });
  state.nextHistoryId += 1;
  state.history = state.history.slice(0, 30);
};

const reject = (state: GameState, error: string): ActionResult => ({
  ok: false,
  state,
  error,
});

const assertActionHeader = (state: GameState, action: GameAction): string | null => {
  if (state.status === "ended") {
    return "ゲーム終了後は通常アクションを実行できません。";
  }
  if (currentPlayer(state).id !== action.playerId) {
    return "現在手番のプレイヤーだけが操作できます。";
  }
  return null;
};

const applyTakeCubes = (state: GameState, action: Extract<GameAction, { type: "TAKE_CUBES" }>) => {
  const inputError = validateCubeInput(action.cubes);
  if (inputError) return reject(state, inputError);

  const cubes = normalizeCubes(action.cubes);
  const total = cubeTotal(cubes);
  const selectedColors = cubeColors.filter((color) => cubes[color] > 0);
  const player = currentPlayer(state);

  const isThreeDifferent =
    total === 3 && selectedColors.length === 3 && selectedColors.every((color) => cubes[color] === 1);
  const isTwoSame = total === 2 && selectedColors.length === 1 && cubes[selectedColors[0]] === 2;
  if (!isThreeDifferent && !isTwoSame) {
    return reject(state, "取得は異なる3色を1個ずつ、または同色2個だけ選べます。");
  }

  if (cubeTotal(player.hand) + total > maxHandSize) {
    return reject(state, "手持ち上限10個を超える取得はできません。");
  }

  if (isThreeDifferent) {
    for (const color of cubeColors) {
      if (state.supply[color] < 1) {
        return reject(state, `${color}の共通供給が足りません。`);
      }
    }
  }

  if (isTwoSame) {
    const color = selectedColors[0];
    if (state.supply[color] < 4) {
      return reject(state, "同色2個取得には、その色の共通供給が4個以上必要です。");
    }
  }

  const next = cloneState(state);
  const nextPlayer = currentPlayer(next);
  for (const color of cubeColors) {
    next.supply[color] -= cubes[color];
    nextPlayer.hand[color] += cubes[color];
  }
  addHistory(next, action, `キューブを取得 (${formatCubes(cubes)})`);
  advanceTurn(next);
  return { ok: true, state: next } as ActionResult;
};

const applyPlaceCubes = (
  state: GameState,
  action: Extract<GameAction, { type: "PLACE_CUBES" }>
) => {
  const inputError = validateCubeInput(action.cubes);
  if (inputError) return reject(state, inputError);

  const cubes = normalizeCubes(action.cubes);
  const total = cubeTotal(cubes);
  if (total < 1 || total > 3) {
    return reject(state, "配置は1回に1〜3個です。");
  }

  const area = state.areas.find((candidate) => candidate.id === action.areaId);
  if (!area) return reject(state, "存在しないエリアです。");
  if (areaTotal(area) + total > getAreaCapacity(state)) {
    return reject(state, "現在フェーズのエリア容量を超えています。");
  }

  const player = currentPlayer(state);
  for (const color of cubeColors) {
    if (player.hand[color] < cubes[color]) {
      return reject(state, "手元にないキューブは配置できません。");
    }
  }

  const next = cloneState(state);
  const nextArea = next.areas.find((candidate) => candidate.id === action.areaId);
  const nextPlayer = currentPlayer(next);
  if (!nextArea) return reject(state, "存在しないエリアです。");
  for (const color of cubeColors) {
    nextPlayer.hand[color] -= cubes[color];
    nextArea.cubes[color] += cubes[color];
  }
  addHistory(next, action, `${nextArea.label}へ配置 (${formatCubes(cubes)})`);
  advanceTurn(next);
  return { ok: true, state: next } as ActionResult;
};

const applyBuildCity = (
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_CITY" }>
) => {
  const intersection = state.intersections.find(
    (candidate) => candidate.id === action.intersectionId
  );
  if (!intersection) return reject(state, "存在しない交点です。");
  if (intersection.city) return reject(state, "この交点にはすでに街があります。");

  for (const color of cubeColors) {
    const areaId = action.payment[color];
    if (!intersection.adjacentAreaIds.includes(areaId)) {
      return reject(state, "交点に隣接しないエリアからは支払えません。");
    }
    const area = state.areas.find((candidate) => candidate.id === areaId);
    if (!area || area.cubes[color] < 1) {
      return reject(state, "隣接エリア群に建設コストの3色が揃っていません。");
    }
  }

  const next = cloneState(state);
  const nextIntersection = next.intersections.find(
    (candidate) => candidate.id === action.intersectionId
  );
  if (!nextIntersection) return reject(state, "存在しない交点です。");
  for (const color of cubeColors) {
    const area = next.areas.find((candidate) => candidate.id === action.payment[color]);
    if (!area) return reject(state, "存在しないエリアです。");
    area.cubes[color] -= 1;
    next.supply[color] += 1;
  }
  nextIntersection.city = { playerId: action.playerId };
  addHistory(next, action, `${nextIntersection.id}に街を建設`);
  advanceTurn(next);
  return { ok: true, state: next } as ActionResult;
};

export const applyAction = (state: GameState, action: GameAction): ActionResult => {
  const headerError = assertActionHeader(state, action);
  if (headerError) return reject(state, headerError);

  if (action.type === "TAKE_CUBES") return applyTakeCubes(state, action);
  if (action.type === "PLACE_CUBES") return applyPlaceCubes(state, action);
  if (action.type === "BUILD_CITY") return applyBuildCity(state, action);

  const next = cloneState(state);
  addHistory(next, action, "パス");
  advanceTurn(next);
  return { ok: true, state: next };
};

const formatCubes = (cubes: CubeCounts): string =>
  cubeColors
    .filter((color) => cubes[color] > 0)
    .map((color) => `${color}:${cubes[color]}`)
    .join(", ");

export const getLegalInfo = (state: GameState, canUndo = false): LegalInfo => {
  if (state.status === "ended") {
    return {
      canUndo,
      canPass: false,
      takeOptions: [],
      placeableAreaIds: [],
      buildableIntersections: [],
    };
  }

  const player = currentPlayer(state);
  const handTotal = cubeTotal(player.hand);
  const takeOptions: PartialCubeCounts[] = [];
  if (handTotal + 3 <= maxHandSize && cubeColors.every((color) => state.supply[color] >= 1)) {
    takeOptions.push({ red: 1, blue: 1, yellow: 1 });
  }
  for (const color of cubeColors) {
    if (handTotal + 2 <= maxHandSize && state.supply[color] >= 4) {
      takeOptions.push({ [color]: 2 });
    }
  }

  const areaCapacity = getAreaCapacity(state);
  const hasAnyHandCube = cubeColors.some((color) => player.hand[color] > 0);
  const placeableAreaIds = hasAnyHandCube
    ? state.areas
        .filter((area) => areaTotal(area) < areaCapacity)
        .map((area) => area.id)
    : [];

  const buildableIntersections = state.intersections
    .filter((intersection) => !intersection.city)
    .map((intersection) => {
      const missingColors = cubeColors.filter((color) =>
        intersection.adjacentAreaIds.every((areaId) => {
          const area = state.areas.find((candidate) => candidate.id === areaId);
          return !area || area.cubes[color] <= 0;
        })
      );
      return {
        intersectionId: intersection.id,
        adjacentAreaIds: intersection.adjacentAreaIds,
        missingColors,
      };
    });

  return {
    canUndo,
    canPass: true,
    takeOptions,
    placeableAreaIds,
    buildableIntersections,
  };
};

export const toPublicState = (state: GameState, canUndo = false): PublicGameState => {
  const phase = getPhase(state);
  const areaCapacity = getAreaCapacity(state);
  const players = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    hand: player.hand,
    handTotal: cubeTotal(player.hand),
    cityCount: cityCountForPlayer(state, player.id),
    turnsTaken: player.turnsTaken,
  }));
  const maxCities = Math.max(...players.map((player) => player.cityCount));
  const winners = state.status === "ended"
    ? players.filter((player) => player.cityCount === maxCities)
    : [];
  const activePlayer = state.status === "active" ? currentPlayer(state) : null;

  return {
    status: state.status,
    round: state.round,
    maxRounds: state.maxRounds,
    phase,
    areaCapacity,
    currentPlayerId: activePlayer?.id ?? null,
    currentPlayerName: activePlayer?.name ?? null,
    players,
    supply: state.supply,
    areas: state.areas.map((area) => ({
      ...area,
      cubeTotal: areaTotal(area),
    })),
    intersections: state.intersections.map((intersection) => {
      const owner = intersection.city
        ? state.players.find((player) => player.id === intersection.city?.playerId)
        : null;
      return {
        ...intersection,
        city: owner ? { playerId: owner.id, playerColor: owner.color } : null,
      };
    }),
    history: state.history,
    legal: getLegalInfo(state, canUndo),
    winners,
  };
};
