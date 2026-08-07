import {
  type ActionLogEntry,
  type AreaColor,
  type CardSummary,
  type CardType,
  type CubeColor,
  type CubeCounts,
  type CubeMove,
  type CubePlacement,
  cubeColors,
  type GameAction,
  type GamePhase,
  type LegalInfo,
  type PartialCubeCounts,
  type ProductionEntry,
  type PublicGameState,
} from "@sdb/protocol";

export { cubeColors };
export type { CubeColor, CubeCounts, GameAction, PublicGameState };

const cardsPerPlayerPerRound = 8;
const maxRounds = 3;
const hexSize = 86;
const playerColors = ["#d73a31", "#1f6feb", "#2da44e", "#b7791f"];
const cityCost: CubeCounts = { red: 1, blue: 1, yellow: 1 };

export type CardDefinition = Omit<CardSummary, "instanceId">;

export type CardInstance = {
  instanceId: string;
  type: CardType;
};

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
  cubes: CubeCounts;
  handCards: CardInstance[];
  contribution: number;
};

export type GameState = {
  status: "active" | "ended";
  phase: GamePhase;
  round: number;
  maxRounds: number;
  currentPlayerIndex: number;
  turnCardUsed: boolean;
  draftPickNumber: number;
  players: PlayerState[];
  draftPacks: CardInstance[][];
  areas: AreaState[];
  intersections: IntersectionState[];
  lastProduction: ProductionEntry[];
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

export const cardDefinitions: Record<CardType, CardDefinition> = {
  "red-development": {
    type: "red-development",
    name: "赤の発展",
    color: "red",
    developmentText: "手元の赤キューブを最大3個、1つのエリアへ置く",
    scoringText: "現在の赤エリア1つにつき1貢献度",
  },
  "blue-development": {
    type: "blue-development",
    name: "青の発展",
    color: "blue",
    developmentText: "手元の青キューブを最大3個、1つのエリアへ置く",
    scoringText: "現在の青エリア1つにつき1貢献度",
  },
  "yellow-development": {
    type: "yellow-development",
    name: "黄の発展",
    color: "yellow",
    developmentText: "手元の黄キューブを最大3個、1つのエリアへ置く",
    scoringText: "現在の黄エリア1つにつき1貢献度",
  },
  "focused-development": {
    type: "focused-development",
    name: "集中開発",
    color: "multi",
    developmentText: "手元から任意色を合計4個まで、1つのエリアへ置く",
    scoringText: "容量上限まで発展したエリア1つにつき1貢献度",
  },
  "wide-development": {
    type: "wide-development",
    name: "広域開発",
    color: "multi",
    developmentText: "手元から任意色を合計3個まで、複数エリアへ分けて置く",
    scoringText: "自分の都市が接している色付きエリア1つにつき1貢献度",
  },
  redevelopment: {
    type: "redevelopment",
    name: "再開発",
    color: "multi",
    developmentText: "盤面キューブ1個を隣接エリアへ移動し、任意色を最大2個配置できる",
    scoringText: "現在の中立エリア1つにつき1貢献度",
  },
};

const deckPattern: CardType[] = [
  "red-development",
  "blue-development",
  "yellow-development",
  "focused-development",
  "wide-development",
  "redevelopment",
  "red-development",
  "blue-development",
  "yellow-development",
  "focused-development",
  "wide-development",
  "redevelopment",
];

const emptyCubes = (): CubeCounts => ({ red: 0, blue: 0, yellow: 0 });

const cubeTotal = (cubes: PartialCubeCounts): number =>
  cubeColors.reduce((total, color) => total + (cubes[color] ?? 0), 0);

const normalizeCubes = (cubes: PartialCubeCounts = {}): CubeCounts => ({
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

const summarizeCard = (card: CardInstance): CardSummary => ({
  instanceId: card.instanceId,
  ...cardDefinitions[card.type],
});

export const getAreaColor = (cubes: CubeCounts): AreaColor => {
  const counts = cubeColors.map((color) => ({ color, count: cubes[color] }));
  const max = Math.max(...counts.map((entry) => entry.count));
  const maxColors = counts.filter((entry) => entry.count === max);
  if (max === 0 || maxColors.length === 3) return "neutral";
  if (maxColors.length === 1) return maxColors[0].color;

  const remaining = counts.filter((entry) => entry.count !== max);
  return remaining[0]?.count > 0 ? remaining[0].color : "neutral";
};

export const getWorldLevelFromCubeTotal = (boardCubeTotal: number): 1 | 2 | 3 => {
  if (boardCubeTotal <= 13) return 1;
  if (boardCubeTotal <= 27) return 2;
  return 3;
};

export const getBoardCubeTotal = (state: GameState): number =>
  state.areas.reduce((total, area) => total + areaTotal(area), 0);

export const getWorldLevel = (state: GameState): 1 | 2 | 3 =>
  getWorldLevelFromCubeTotal(getBoardCubeTotal(state));

export const getCityLevel = (state: GameState): 1 | 2 | 3 => getWorldLevel(state);

export const getPhase = (state: GameState): 1 | 2 | 3 => getWorldLevel(state);

const getAreaCapacityForWorldLevel = (worldLevel: 1 | 2 | 3): number => {
  if (worldLevel === 1) return 3;
  if (worldLevel === 2) return 5;
  return 7;
};

const getAreaCapacityForCubeTotal = (boardCubeTotal: number): number =>
  getAreaCapacityForWorldLevel(getWorldLevelFromCubeTotal(boardCubeTotal));

export const getAreaCapacity = (state: GameState): number =>
  getAreaCapacityForWorldLevel(getWorldLevel(state));

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
  const state: GameState = {
    status: "active",
    phase: "draft",
    round: 1,
    maxRounds,
    currentPlayerIndex: 0,
    turnCardUsed: false,
    draftPickNumber: 1,
    players: names.map((name, index) => ({
      id: `player-${index + 1}`,
      name,
      color: playerColors[index],
      cubes: emptyCubes(),
      handCards: [],
      contribution: 0,
    })),
    draftPacks: [],
    areas: board.areas,
    intersections: board.intersections,
    lastProduction: [],
    history: [],
    nextHistoryId: 1,
  };
  startRound(state);
  return state;
};

export const validateCubeTotals = (state: GameState): boolean => {
  void state;
  return true;
};

const validateCubeInput = (cubes: PartialCubeCounts = {}): string | null => {
  for (const color of cubeColors) {
    const value = cubes[color] ?? 0;
    if (!Number.isInteger(value) || value < 0) {
      return "キューブ数は0以上の整数で指定してください。";
    }
  }
  return null;
};

const getArea = (state: GameState, areaId: string): AreaState | null =>
  state.areas.find((candidate) => candidate.id === areaId) ?? null;

const areAdjacentAreas = (state: GameState, firstAreaId: string, secondAreaId: string): boolean => {
  const first = getArea(state, firstAreaId);
  const second = getArea(state, secondAreaId);
  if (!first || !second || first.id === second.id) return false;
  const dq = first.q - second.q;
  const dr = first.r - second.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 === 1;
};

const addHistory = (
  state: GameState,
  type: ActionLogEntry["type"],
  playerId: string | null,
  summary: string
): void => {
  const player = playerId
    ? state.players.find((candidate) => candidate.id === playerId)
    : null;
  state.history.unshift({
    id: state.nextHistoryId,
    round: state.round,
    phase: state.phase,
    playerId,
    playerName: player?.name ?? "System",
    type,
    summary,
  });
  state.nextHistoryId += 1;
  state.history = state.history.slice(0, 50);
};

const reject = (state: GameState, error: string): ActionResult => ({
  ok: false,
  state,
  error,
});

const assertCurrentPlayer = (state: GameState, playerId: string): string | null => {
  if (state.status === "ended") {
    return "ゲーム終了後は操作できません。";
  }
  if (currentPlayer(state).id !== playerId) {
    return "現在手番のプレイヤーだけが操作できます。";
  }
  return null;
};

const createRoundPacks = (state: GameState): CardInstance[][] => {
  const totalCards = state.players.length * cardsPerPlayerPerRound;
  const cards = Array.from({ length: totalCards }, (_, index): CardInstance => {
    const patternIndex = ((state.round - 1) * totalCards + index) % deckPattern.length;
    const type = deckPattern[patternIndex];
    return {
      instanceId: `r${state.round}-c${String(index + 1).padStart(2, "0")}-${type}`,
      type,
    };
  });

  return state.players.map((_, playerIndex) =>
    cards.slice(
      playerIndex * cardsPerPlayerPerRound,
      (playerIndex + 1) * cardsPerPlayerPerRound
    )
  );
};

const produceForRound = (state: GameState): ProductionEntry[] => {
  const cityLevel = getCityLevel(state);
  const areaColors = new Map(state.areas.map((area) => [area.id, getAreaColor(area.cubes)]));
  const entries = state.players.map((player): ProductionEntry => ({
    playerId: player.id,
    playerName: player.name,
    cubes: emptyCubes(),
  }));

  for (const intersection of state.intersections) {
    if (!intersection.city) continue;
    const entry = entries.find((candidate) => candidate.playerId === intersection.city?.playerId);
    if (!entry) continue;
    for (const areaId of intersection.adjacentAreaIds) {
      const color = areaColors.get(areaId);
      if (!color || color === "neutral") continue;
      entry.cubes[color] += cityLevel;
    }
  }

  for (const entry of entries) {
    const player = state.players.find((candidate) => candidate.id === entry.playerId);
    if (!player) continue;
    for (const color of cubeColors) {
      player.cubes[color] += entry.cubes[color];
    }
  }

  return entries;
};

const startRound = (state: GameState): void => {
  state.phase = "draft";
  state.currentPlayerIndex = 0;
  state.turnCardUsed = false;
  state.draftPickNumber = 1;
  state.players.forEach((player) => {
    player.handCards = [];
  });
  state.lastProduction = produceForRound(state);
  state.draftPacks = createRoundPacks(state);
  const produced = state.lastProduction
    .map((entry) => `${entry.playerName}: ${formatCubes(entry.cubes) || "なし"}`)
    .join(" / ");
  addHistory(state, "ROUND_START", null, `ラウンド${state.round}開始。都市生産: ${produced}`);
};

const endGame = (state: GameState): void => {
  state.status = "ended";
  state.phase = "ended";
  state.currentPlayerIndex = 0;
  state.turnCardUsed = false;
  state.draftPacks = [];
  addHistory(state, "GAME_END", null, "3ラウンド終了。最終得点を確定");
};

const advanceAfterTurnEnd = (state: GameState): void => {
  if (state.players.every((player) => player.handCards.length === 0)) {
    if (state.round >= state.maxRounds) {
      endGame(state);
    } else {
      state.round += 1;
      startRound(state);
    }
    return;
  }

  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (state.currentPlayerIndex + offset) % state.players.length;
    if (state.players[index].handCards.length > 0) {
      state.currentPlayerIndex = index;
      state.turnCardUsed = false;
      return;
    }
  }
};

const aggregatePlacements = (
  placements: CubePlacement[]
): { cubesByColor: CubeCounts; cubesByArea: Map<string, CubeCounts>; total: number; error: string | null } => {
  const cubesByColor = emptyCubes();
  const cubesByArea = new Map<string, CubeCounts>();
  let total = 0;

  for (const placement of placements) {
    const inputError = validateCubeInput(placement.cubes);
    if (inputError) return { cubesByColor, cubesByArea, total, error: inputError };
    const cubes = normalizeCubes(placement.cubes);
    const placementTotal = cubeTotal(cubes);
    if (placementTotal <= 0) continue;
    total += placementTotal;
    const areaCubes = cubesByArea.get(placement.areaId) ?? emptyCubes();
    for (const color of cubeColors) {
      cubesByColor[color] += cubes[color];
      areaCubes[color] += cubes[color];
    }
    cubesByArea.set(placement.areaId, areaCubes);
  }

  return { cubesByColor, cubesByArea, total, error: null };
};

const validatePlacementPlan = (
  state: GameState,
  player: PlayerState,
  placements: CubePlacement[],
  maxTotal: number,
  requiredColor?: CubeColor,
  singleArea = false,
  checkCapacity = true
): { cubesByColor: CubeCounts; cubesByArea: Map<string, CubeCounts>; total: number; error: string | null } => {
  const plan = aggregatePlacements(placements);
  if (plan.error) return plan;
  if (plan.total < 1 || plan.total > maxTotal) {
    return { ...plan, error: `配置は1〜${maxTotal}個で指定してください。` };
  }
  if (singleArea && plan.cubesByArea.size !== 1) {
    return { ...plan, error: "このカードは1つのエリアだけに配置できます。" };
  }
  if (requiredColor && cubeColors.some((color) => color !== requiredColor && plan.cubesByColor[color] > 0)) {
    return { ...plan, error: "このカードでは指定色以外を配置できません。" };
  }
  for (const color of cubeColors) {
    if (player.cubes[color] < plan.cubesByColor[color]) {
      return { ...plan, error: "手元にないキューブは配置できません。" };
    }
  }

  if (checkCapacity) {
    const capacity = getAreaCapacityForCubeTotal(getBoardCubeTotal(state) + plan.total);
    for (const [areaId, cubes] of plan.cubesByArea) {
      const area = getArea(state, areaId);
      if (!area) return { ...plan, error: "存在しないエリアです。" };
      if (areaTotal(area) + cubeTotal(cubes) > capacity) {
        return { ...plan, error: "現在のエリア容量を超えています。" };
      }
    }
  }

  return plan;
};

const applyPlacementPlan = (
  state: GameState,
  player: PlayerState,
  plan: { cubesByColor: CubeCounts; cubesByArea: Map<string, CubeCounts> }
): void => {
  for (const color of cubeColors) {
    player.cubes[color] -= plan.cubesByColor[color];
  }
  for (const [areaId, cubes] of plan.cubesByArea) {
    const area = getArea(state, areaId);
    if (!area) continue;
    for (const color of cubeColors) {
      area.cubes[color] += cubes[color];
    }
  }
};

const validateMove = (state: GameState, move: CubeMove | undefined): string | null => {
  if (!move) return "移動するキューブを指定してください。";
  if (!cubeColors.includes(move.color)) return "存在しない色です。";
  const from = getArea(state, move.fromAreaId);
  const to = getArea(state, move.toAreaId);
  if (!from || !to) return "存在しないエリアです。";
  if (!areAdjacentAreas(state, from.id, to.id)) {
    return "隣接していないエリアへは移動できません。";
  }
  if (from.cubes[move.color] < 1) {
    return "移動元に指定色のキューブがありません。";
  }
  if (areaTotal(to) + 1 > getAreaCapacity(state)) {
    return "移動先のエリア容量を超えています。";
  }
  return null;
};

const scoreForCard = (state: GameState, playerId: string, type: CardType): number => {
  if (type === "red-development") {
    return state.areas.filter((area) => getAreaColor(area.cubes) === "red").length;
  }
  if (type === "blue-development") {
    return state.areas.filter((area) => getAreaColor(area.cubes) === "blue").length;
  }
  if (type === "yellow-development") {
    return state.areas.filter((area) => getAreaColor(area.cubes) === "yellow").length;
  }
  if (type === "focused-development") {
    const capacity = getAreaCapacity(state);
    return state.areas.filter((area) => areaTotal(area) >= capacity).length;
  }
  if (type === "wide-development") {
    return state.intersections
      .filter((intersection) => intersection.city?.playerId === playerId)
      .reduce(
        (total, intersection) =>
          total +
          intersection.adjacentAreaIds.filter((areaId) => {
            const area = getArea(state, areaId);
            return area ? getAreaColor(area.cubes) !== "neutral" : false;
          }).length,
        0
      );
  }
  return state.areas.filter((area) => getAreaColor(area.cubes) === "neutral").length;
};

const removeCard = (player: PlayerState, cardInstanceId: string): CardInstance => {
  const cardIndex = player.handCards.findIndex((card) => card.instanceId === cardInstanceId);
  return player.handCards.splice(cardIndex, 1)[0];
};

const applyDraftPick = (
  state: GameState,
  action: Extract<GameAction, { type: "DRAFT_PICK" }>
): ActionResult => {
  if (state.phase !== "draft") return reject(state, "現在はドラフトフェーズではありません。");
  const headerError = assertCurrentPlayer(state, action.playerId);
  if (headerError) return reject(state, headerError);

  const pack = state.draftPacks[state.currentPlayerIndex] ?? [];
  const cardIndex = pack.findIndex((card) => card.instanceId === action.cardInstanceId);
  if (cardIndex < 0) return reject(state, "現在のパックにないカードです。");

  const next = cloneState(state);
  const nextPack = next.draftPacks[next.currentPlayerIndex];
  const [card] = nextPack.splice(cardIndex, 1);
  currentPlayer(next).handCards.push(card);
  addHistory(next, action.type, action.playerId, `${cardDefinitions[card.type].name}をドラフト`);

  const endOfPickCycle = next.currentPlayerIndex === next.players.length - 1;
  const draftComplete = next.draftPacks.every((candidate) => candidate.length === 0);
  if (draftComplete) {
    next.phase = "action";
    next.currentPlayerIndex = 0;
    next.draftPickNumber = cardsPerPlayerPerRound;
    addHistory(next, "ROUND_START", null, "ドラフト完了。アクションフェーズ開始");
  } else if (endOfPickCycle) {
    const rotated: CardInstance[][] = Array.from({ length: next.players.length }, () => []);
    next.draftPacks.forEach((candidate, index) => {
      rotated[(index + 1) % next.players.length] = candidate;
    });
    next.draftPacks = rotated;
    next.draftPickNumber += 1;
    next.currentPlayerIndex = 0;
  } else {
    next.currentPlayerIndex += 1;
  }

  return { ok: true, state: next };
};

const applyBuildCity = (
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_CITY" }>
): ActionResult => {
  if (state.phase !== "action") return reject(state, "都市建設はアクションフェーズ中だけ実行できます。");
  const headerError = assertCurrentPlayer(state, action.playerId);
  if (headerError) return reject(state, headerError);

  const intersection = state.intersections.find(
    (candidate) => candidate.id === action.intersectionId
  );
  if (!intersection) return reject(state, "存在しない交点です。");
  if (intersection.city) return reject(state, "この交点にはすでに都市があります。");

  const player = currentPlayer(state);
  for (const color of cubeColors) {
    if (player.cubes[color] < cityCost[color]) {
      return reject(state, "都市建設には手元の赤・青・黄が1個ずつ必要です。");
    }
  }

  const next = cloneState(state);
  const nextPlayer = currentPlayer(next);
  const nextIntersection = next.intersections.find(
    (candidate) => candidate.id === action.intersectionId
  );
  if (!nextIntersection) return reject(state, "存在しない交点です。");
  for (const color of cubeColors) {
    nextPlayer.cubes[color] -= cityCost[color];
  }
  nextIntersection.city = { playerId: action.playerId };
  addHistory(next, action.type, action.playerId, `${nextIntersection.id}に都市を建設`);
  return { ok: true, state: next };
};

const applyUseCard = (
  state: GameState,
  action: Extract<GameAction, { type: "USE_CARD" }>
): ActionResult => {
  if (state.phase !== "action") return reject(state, "現在はアクションフェーズではありません。");
  const headerError = assertCurrentPlayer(state, action.playerId);
  if (headerError) return reject(state, headerError);
  if (state.turnCardUsed) {
    return reject(state, "この手番ではすでにカードを使用しています。");
  }

  const player = currentPlayer(state);
  const card = player.handCards.find((candidate) => candidate.instanceId === action.cardInstanceId);
  if (!card) return reject(state, "手札にないカードです。");

  if (action.mode === "basic") {
    if (!action.basicColor || !cubeColors.includes(action.basicColor)) {
      return reject(state, "取得する色を指定してください。");
    }
    const next = cloneState(state);
    const nextPlayer = currentPlayer(next);
    const usedCard = removeCard(nextPlayer, action.cardInstanceId);
    nextPlayer.cubes[action.basicColor] += 1;
    addHistory(
      next,
      action.type,
      action.playerId,
      `${cardDefinitions[usedCard.type].name}を基本取得に使用 (${action.basicColor}:1)`
    );
    next.turnCardUsed = true;
    return { ok: true, state: next };
  }

  if (action.mode === "scoring") {
    const gained = scoreForCard(state, action.playerId, card.type);
    const next = cloneState(state);
    const nextPlayer = currentPlayer(next);
    const usedCard = removeCard(nextPlayer, action.cardInstanceId);
    nextPlayer.contribution += gained;
    addHistory(next, action.type, action.playerId, `${cardDefinitions[usedCard.type].name}で${gained}貢献度を獲得`);
    next.turnCardUsed = true;
    return { ok: true, state: next };
  }

  if (action.mode !== "development") {
    return reject(state, "カード用途が不正です。");
  }

  if (
    card.type === "red-development" ||
    card.type === "blue-development" ||
    card.type === "yellow-development"
  ) {
    const requiredColor = cardDefinitions[card.type].color as CubeColor;
    const placements = [{ areaId: action.areaId ?? "", cubes: action.cubes ?? {} }];
    const plan = validatePlacementPlan(state, player, placements, 3, requiredColor, true);
    if (plan.error) return reject(state, plan.error);
    const next = cloneState(state);
    const nextPlayer = currentPlayer(next);
    const usedCard = removeCard(nextPlayer, action.cardInstanceId);
    applyPlacementPlan(next, nextPlayer, plan);
    addHistory(next, action.type, action.playerId, `${cardDefinitions[usedCard.type].name}で配置 (${formatCubes(plan.cubesByColor)})`);
    next.turnCardUsed = true;
    return { ok: true, state: next };
  }

  if (card.type === "focused-development") {
    const placements = [{ areaId: action.areaId ?? "", cubes: action.cubes ?? {} }];
    const plan = validatePlacementPlan(state, player, placements, 4, undefined, true);
    if (plan.error) return reject(state, plan.error);
    const next = cloneState(state);
    const nextPlayer = currentPlayer(next);
    const usedCard = removeCard(nextPlayer, action.cardInstanceId);
    applyPlacementPlan(next, nextPlayer, plan);
    addHistory(next, action.type, action.playerId, `${cardDefinitions[usedCard.type].name}で配置 (${formatCubes(plan.cubesByColor)})`);
    next.turnCardUsed = true;
    return { ok: true, state: next };
  }

  if (card.type === "wide-development") {
    const plan = validatePlacementPlan(state, player, action.placements ?? [], 3);
    if (plan.error) return reject(state, plan.error);
    const next = cloneState(state);
    const nextPlayer = currentPlayer(next);
    const usedCard = removeCard(nextPlayer, action.cardInstanceId);
    applyPlacementPlan(next, nextPlayer, plan);
    addHistory(next, action.type, action.playerId, `${cardDefinitions[usedCard.type].name}で広域配置 (${formatCubes(plan.cubesByColor)})`);
    next.turnCardUsed = true;
    return { ok: true, state: next };
  }

  const moveError = validateMove(state, action.move);
  if (moveError) return reject(state, moveError);
  const placements = action.placements ?? [];
  const plan = placements.length > 0
    ? validatePlacementPlan(state, player, placements, 2, undefined, false, false)
    : { cubesByColor: emptyCubes(), cubesByArea: new Map<string, CubeCounts>(), total: 0, error: null };
  if (plan.error) return reject(state, plan.error);

  const afterMove = cloneState(state);
  const movedFrom = getArea(afterMove, action.move!.fromAreaId)!;
  const movedTo = getArea(afterMove, action.move!.toAreaId)!;
  movedFrom.cubes[action.move!.color] -= 1;
  movedTo.cubes[action.move!.color] += 1;
  for (const [areaId, cubes] of plan.cubesByArea) {
    const area = getArea(afterMove, areaId);
    const capacityAfterPlacement = getAreaCapacityForCubeTotal(getBoardCubeTotal(afterMove) + plan.total);
    if (!area || areaTotal(area) + cubeTotal(cubes) > capacityAfterPlacement) {
      return reject(state, "移動・配置後のエリア容量を超えています。");
    }
  }

  const nextPlayer = currentPlayer(afterMove);
  const usedCard = removeCard(nextPlayer, action.cardInstanceId);
  applyPlacementPlan(afterMove, nextPlayer, plan);
  addHistory(
    afterMove,
    action.type,
    action.playerId,
    `${cardDefinitions[usedCard.type].name}で${action.move!.color}を移動し配置 (${formatCubes(plan.cubesByColor) || "なし"})`
  );
  afterMove.turnCardUsed = true;
  return { ok: true, state: afterMove };
};

const applyEndTurn = (
  state: GameState,
  action: Extract<GameAction, { type: "END_TURN" }>
): ActionResult => {
  if (state.phase !== "action") return reject(state, "現在はアクションフェーズではありません。");
  const headerError = assertCurrentPlayer(state, action.playerId);
  if (headerError) return reject(state, headerError);
  if (!state.turnCardUsed) {
    return reject(state, "手番終了前にカードを1枚使用してください。");
  }

  const next = cloneState(state);
  addHistory(next, action.type, action.playerId, "手番終了");
  advanceAfterTurnEnd(next);
  return { ok: true, state: next };
};

export const applyAction = (state: GameState, action: GameAction): ActionResult => {
  if (state.status === "ended") return reject(state, "ゲーム終了後は操作できません。");
  if (action.type === "DRAFT_PICK") return applyDraftPick(state, action);
  if (action.type === "USE_CARD") return applyUseCard(state, action);
  if (action.type === "BUILD_CITY") return applyBuildCity(state, action);
  if (action.type === "END_TURN") return applyEndTurn(state, action);
  return reject(state, "未対応のアクションです。");
};

const formatCubes = (cubes: CubeCounts | PartialCubeCounts): string =>
  cubeColors
    .filter((color) => (cubes[color] ?? 0) > 0)
    .map((color) => `${color}:${cubes[color]}`)
    .join(", ");

export const getLegalInfo = (state: GameState, canUndo = false): LegalInfo => {
  if (state.status === "ended") {
    return {
      canUndo,
      canDraft: false,
      canUseCard: false,
      canBuildCity: false,
      canEndTurn: false,
      draftPack: [],
      buildableIntersectionIds: [],
    };
  }

  const player = currentPlayer(state);
  const canPayCity = cubeColors.every((color) => player.cubes[color] >= cityCost[color]);

  return {
    canUndo,
    canDraft: state.phase === "draft",
    canUseCard: state.phase === "action" && player.handCards.length > 0 && !state.turnCardUsed,
    canBuildCity: state.phase === "action" && canPayCity,
    canEndTurn: state.phase === "action" && state.turnCardUsed,
    draftPack: state.phase === "draft"
      ? (state.draftPacks[state.currentPlayerIndex] ?? []).map(summarizeCard)
      : [],
    buildableIntersectionIds: state.phase === "action" && canPayCity
      ? state.intersections
          .filter((intersection) => !intersection.city)
          .map((intersection) => intersection.id)
      : [],
  };
};

export const toPublicState = (state: GameState, canUndo = false): PublicGameState => {
  const worldLevel = getWorldLevel(state);
  const areaCapacity = getAreaCapacity(state);
  const players = state.players.map((player) => {
    const cityCount = cityCountForPlayer(state, player.id);
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      cubes: player.cubes,
      cubeTotal: cubeTotal(player.cubes),
      cityCount,
      contribution: player.contribution,
      finalScore: player.contribution + cityCount,
      handCards: player.handCards.map(summarizeCard),
    };
  });
  const maxScore = Math.max(...players.map((player) => player.finalScore));
  const winners = state.status === "ended"
    ? players.filter((player) => player.finalScore === maxScore)
    : [];
  const activePlayer = state.status === "active" ? currentPlayer(state) : null;

  return {
    status: state.status,
    phase: state.phase,
    round: state.round,
    maxRounds: state.maxRounds,
    worldLevel,
    cityLevel: worldLevel,
    areaCapacity,
    boardCubeTotal: getBoardCubeTotal(state),
    currentPlayerId: activePlayer?.id ?? null,
    currentPlayerName: activePlayer?.name ?? null,
    turnCardUsed: state.turnCardUsed,
    draftPickNumber: state.draftPickNumber,
    players,
    areas: state.areas.map((area) => ({
      ...area,
      cubeTotal: areaTotal(area),
      areaColor: getAreaColor(area.cubes),
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
    lastProduction: state.lastProduction,
    history: state.history,
    legal: getLegalInfo(state, canUndo),
    winners,
  };
};
