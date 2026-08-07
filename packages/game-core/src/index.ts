import {
  type ActionLogEntry,
  type AreaColor,
  type CardInstance,
  type CardKind,
  cardDefinitions,
  type CubeColor,
  type CubeCounts,
  cubeColors,
  type GameAction,
  type LegalInfo,
  type PartialCubeCounts,
  type PublicGameState,
} from "@sdb/protocol";

export { cardDefinitions, cubeColors };
export type { AreaColor, CardInstance, CardKind, CubeColor, CubeCounts, GameAction, PublicGameState };

const totalCubesPerColor = 15;
const maxHandSize = 10;
const maxRounds = 12;
const hexSize = 86;
const playerColors = ["#d73a31", "#1f6feb", "#2da44e", "#b7791f"];
const cardKinds = Object.keys(cardDefinitions) as CardKind[];

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
  scoreFromCards: number;
  cards: CardInstance[];
  usedCards: CardInstance[];
  turnsTaken: number;
};

export type DraftState = {
  round: number;
  totalRounds: number;
  currentPlayerIndex: number;
  packs: CardInstance[][];
};

export type GameState = {
  status: "draft" | "active" | "ended";
  round: number;
  maxRounds: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  supply: CubeCounts;
  areas: AreaState[];
  intersections: IntersectionState[];
  draft: DraftState | null;
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

const cloneState = (state: GameState): GameState => structuredClone(state) as GameState;

const areaTotal = (area: AreaState): number => cubeTotal(area.cubes);

const currentPlayer = (state: GameState): PlayerState => state.players[state.currentPlayerIndex];

const cityCountForPlayer = (state: GameState, playerId: string): number =>
  state.intersections.filter((intersection) => intersection.city?.playerId === playerId).length;

export const getContribution = (state: GameState, playerId: string): number => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return (player?.scoreFromCards ?? 0) + cityCountForPlayer(state, playerId);
};

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

export const getAreaColor = (cubes: CubeCounts): AreaColor => {
  const values = cubeColors.map((color) => ({ color, count: cubes[color] }));
  const max = Math.max(...values.map((value) => value.count));
  if (max === 0) return "neutral";
  const maxColors = values.filter((value) => value.count === max);
  if (maxColors.length === 1) return maxColors[0].color;
  const remaining = values.filter((value) => value.count !== max && value.count > 0);
  if (remaining.length === 0) return "neutral";
  remaining.sort((a, b) => b.count - a.count);
  return remaining[0].color;
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

  const byCorner = new Map<string, { x: number; y: number; adjacentAreaIds: Set<string> }>();

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

const createDraft = (playerCount: number): DraftState => {
  const deck = Array.from({ length: 4 }, (_, copyIndex) =>
    cardKinds.map(
      (kind): CardInstance => ({
        id: `${kind}-${copyIndex + 1}`,
        kind,
      })
    )
  ).flat();
  return {
    round: 1,
    totalRounds: 4,
    currentPlayerIndex: 0,
    packs: Array.from({ length: playerCount }, (_, index) =>
      deck.slice(index * 4, index * 4 + 4)
    ),
  };
};

export const createInitialState = (playerNames: string[]): GameState => {
  const names = playerNames.map((name) => name.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 4) {
    throw new Error("プレイヤー人数は2〜4人にしてください。");
  }

  const board = createBoardDefinition();
  return {
    status: "draft",
    round: 1,
    maxRounds,
    currentPlayerIndex: 0,
    players: names.map((name, index) => ({
      id: `player-${index + 1}`,
      name,
      color: playerColors[index],
      hand: emptyCubes(),
      scoreFromCards: 0,
      cards: [],
      usedCards: [],
      turnsTaken: 0,
    })),
    supply: fullSupply(),
    areas: board.areas,
    intersections: board.intersections,
    draft: createDraft(names.length),
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
  state.history = state.history.slice(0, 40);
};

const reject = (state: GameState, error: string): ActionResult => ({ ok: false, state, error });

const assertCurrentActor = (state: GameState, playerId: string): string | null => {
  if (currentPlayer(state).id !== playerId) {
    return "現在手番のプレイヤーだけが操作できます。";
  }
  return null;
};

const assertActionHeader = (state: GameState, action: GameAction): string | null => {
  if (state.status === "ended") {
    return "ゲーム終了後は通常アクションを実行できません。";
  }
  const actorError = assertCurrentActor(state, action.playerId);
  if (actorError) return actorError;
  if (state.status === "draft" && action.type !== "DRAFT_PICK") {
    return "ドラフト中はカード選択だけ実行できます。";
  }
  if (state.status === "active" && action.type === "DRAFT_PICK") {
    return "ドラフトは完了しています。";
  }
  return null;
};

const takeCard = (player: PlayerState, cardId: string | undefined): CardInstance | null => {
  if (!cardId) return null;
  return player.cards.find((card) => card.id === cardId) ?? null;
};

const discardCard = (player: PlayerState, card: CardInstance): void => {
  player.cards = player.cards.filter((candidate) => candidate.id !== card.id);
  player.usedCards.push(card);
};

const colorForDevelopmentCard = (kind: CardKind): CubeColor | null => {
  if (kind === "red-development") return "red";
  if (kind === "blue-development") return "blue";
  if (kind === "yellow-development") return "yellow";
  return null;
};

const hasCityPlacementBonus = (state: GameState, playerId: string, areaId: string): boolean =>
  state.intersections.some(
    (intersection) =>
      intersection.adjacentAreaIds.includes(areaId) && intersection.city?.playerId === playerId
  );

export const getPlacementLimit = (
  state: GameState,
  playerId: string,
  areaId: string,
  focusCard = false
): number => 3 + (hasCityPlacementBonus(state, playerId, areaId) ? 1 : 0) + (focusCard ? 1 : 0);

const areAreasAdjacent = (state: GameState, fromAreaId: string, toAreaId: string): boolean => {
  if (fromAreaId === toAreaId) return false;
  const from = state.areas.find((area) => area.id === fromAreaId);
  const to = state.areas.find((area) => area.id === toAreaId);
  if (!from || !to) return false;
  const dq = from.q - to.q;
  const dr = from.r - to.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1;
};

const applyTakeCubes = (state: GameState, action: Extract<GameAction, { type: "TAKE_CUBES" }>) => {
  const inputError = validateCubeInput(action.cubes);
  if (inputError) return reject(state, inputError);

  const cubes = normalizeCubes(action.cubes);
  const total = cubeTotal(cubes);
  const selectedColors = cubeColors.filter((color) => cubes[color] > 0);
  const player = currentPlayer(state);
  const card = takeCard(player, action.accelerateCardId);
  const extraColor = card ? colorForDevelopmentCard(card.kind) : null;

  if (card && !extraColor) {
    return reject(state, "このカードは取得の加速には使えません。");
  }

  const isThreeDifferent =
    total === 3 && selectedColors.length === 3 && selectedColors.every((color) => cubes[color] === 1);
  const isTwoSame = total === 2 && selectedColors.length === 1 && cubes[selectedColors[0]] === 2;
  if (!isThreeDifferent && !isTwoSame) {
    return reject(state, "取得は異なる3色を1個ずつ、または同色2個だけ選べます。");
  }

  if (cubeTotal(player.hand) + total + (extraColor ? 1 : 0) > maxHandSize) {
    return reject(state, "手持ち上限10個を超える取得はできません。");
  }

  if (isThreeDifferent) {
    for (const color of cubeColors) {
      if (state.supply[color] < 1 + (extraColor === color ? 1 : 0)) {
        return reject(state, `${color}の共通供給が足りません。`);
      }
    }
  }

  if (isTwoSame) {
    const color = selectedColors[0];
    if (state.supply[color] < 4) {
      return reject(state, "同色2個取得には、その色の共通供給が4個以上必要です。");
    }
    if (extraColor && state.supply[extraColor] < cubes[extraColor] + 1) {
      return reject(state, "加速カードで取るキューブの共通供給が足りません。");
    }
  }

  const next = cloneState(state);
  const nextPlayer = currentPlayer(next);
  const nextCard = takeCard(nextPlayer, action.accelerateCardId);
  for (const color of cubeColors) {
    next.supply[color] -= cubes[color];
    nextPlayer.hand[color] += cubes[color];
  }
  if (extraColor) {
    next.supply[extraColor] -= 1;
    nextPlayer.hand[extraColor] += 1;
  }
  if (nextCard) discardCard(nextPlayer, nextCard);
  addHistory(next, action, `キューブを取得 (${formatCubes(cubes)}${extraColor ? ` + ${extraColor}:1` : ""})`);
  advanceTurn(next);
  return { ok: true, state: next } as ActionResult;
};

const validateRedevelopmentMove = (
  state: GameState,
  move: Extract<GameAction, { type: "PLACE_CUBES" }>["redevelopmentMove"]
): string | null => {
  if (!move) return "再開発カードでは移動するキューブを指定してください。";
  const from = state.areas.find((area) => area.id === move.fromAreaId);
  const to = state.areas.find((area) => area.id === move.toAreaId);
  if (!from || !to) return "再開発の移動元または移動先エリアが存在しません。";
  if (!areAreasAdjacent(state, from.id, to.id)) return "再開発では隣接エリアへだけ移動できます。";
  if (from.cubes[move.color] < 1) return "移動元に指定色のキューブがありません。";
  if (areaTotal(to) + 1 > getAreaCapacity(state)) return "再開発の移動先が容量を超えます。";
  return null;
};

const applyPlaceCubes = (
  state: GameState,
  action: Extract<GameAction, { type: "PLACE_CUBES" }>
) => {
  const inputError = validateCubeInput(action.cubes);
  if (inputError) return reject(state, inputError);

  const cubes = normalizeCubes(action.cubes);
  const total = cubeTotal(cubes);
  const area = state.areas.find((candidate) => candidate.id === action.areaId);
  if (!area) return reject(state, "存在しないエリアです。");

  const player = currentPlayer(state);
  const card = takeCard(player, action.accelerateCardId);
  const usesFocus = card?.kind === "focused-development";
  const usesRedevelopment = card?.kind === "redevelopment";
  if (card && !usesFocus && !usesRedevelopment) {
    return reject(state, "このカードは配置の加速には使えません。");
  }
  if (usesRedevelopment) {
    const moveError = validateRedevelopmentMove(state, action.redevelopmentMove);
    if (moveError) return reject(state, moveError);
  } else if (action.redevelopmentMove) {
    return reject(state, "再開発カードなしでキューブ移動はできません。");
  }

  const placementLimit = getPlacementLimit(state, player.id, action.areaId, usesFocus);
  if (total < 1 || total > placementLimit) {
    return reject(state, `配置は1回に1〜${placementLimit}個です。`);
  }

  for (const color of cubeColors) {
    if (player.hand[color] < cubes[color]) {
      return reject(state, "手元にないキューブは配置できません。");
    }
  }

  const next = cloneState(state);
  const nextArea = next.areas.find((candidate) => candidate.id === action.areaId);
  const nextPlayer = currentPlayer(next);
  const nextCard = takeCard(nextPlayer, action.accelerateCardId);
  if (!nextArea) return reject(state, "存在しないエリアです。");

  if (usesRedevelopment && action.redevelopmentMove) {
    const from = next.areas.find((candidate) => candidate.id === action.redevelopmentMove?.fromAreaId);
    const to = next.areas.find((candidate) => candidate.id === action.redevelopmentMove?.toAreaId);
    if (!from || !to) return reject(state, "再開発の移動元または移動先エリアが存在しません。");
    from.cubes[action.redevelopmentMove.color] -= 1;
    to.cubes[action.redevelopmentMove.color] += 1;
  }

  if (areaTotal(nextArea) + total > getAreaCapacity(next)) {
    return reject(state, "現在フェーズのエリア容量を超えています。");
  }
  for (const color of cubeColors) {
    nextPlayer.hand[color] -= cubes[color];
    nextArea.cubes[color] += cubes[color];
  }
  if (nextCard) discardCard(nextPlayer, nextCard);
  addHistory(next, action, `${nextArea.label}へ配置 (${formatCubes(cubes)}${card ? ` / ${cardDefinitions[card.kind].name}` : ""})`);
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

  const player = currentPlayer(state);
  const card = takeCard(player, action.accelerateCardId);
  if (card && card.kind !== "urbanization") {
    return reject(state, "このカードは街建設の加速には使えません。");
  }
  if (card && !action.waivedColor) return reject(state, "都市化カードでは免除色を指定してください。");
  if (!card && action.waivedColor) return reject(state, "都市化カードなしで支払い免除はできません。");

  for (const color of cubeColors) {
    if (card && action.waivedColor === color) continue;
    const areaId = action.payment[color];
    if (!areaId || !intersection.adjacentAreaIds.includes(areaId)) {
      return reject(state, "交点に隣接しないエリアからは支払えません。");
    }
    const area = state.areas.find((candidate) => candidate.id === areaId);
    if (!area || area.cubes[color] < 1) {
      return reject(state, "隣接エリア群に建設コストが揃っていません。");
    }
  }

  const next = cloneState(state);
  const nextIntersection = next.intersections.find(
    (candidate) => candidate.id === action.intersectionId
  );
  const nextPlayer = currentPlayer(next);
  const nextCard = takeCard(nextPlayer, action.accelerateCardId);
  if (!nextIntersection) return reject(state, "存在しない交点です。");
  for (const color of cubeColors) {
    if (nextCard?.kind === "urbanization" && action.waivedColor === color) continue;
    const area = next.areas.find((candidate) => candidate.id === action.payment[color]);
    if (!area) return reject(state, "存在しないエリアです。");
    area.cubes[color] -= 1;
    next.supply[color] += 1;
  }
  if (nextCard) discardCard(nextPlayer, nextCard);
  nextIntersection.city = { playerId: action.playerId };
  addHistory(next, action, `${nextIntersection.id}に街を建設${action.waivedColor ? ` (${action.waivedColor}免除)` : ""}`);
  advanceTurn(next);
  return { ok: true, state: next } as ActionResult;
};

const scoreForCard = (state: GameState, playerId: string, kind: CardKind): number => {
  const color = colorForDevelopmentCard(kind);
  if (color) return state.areas.filter((area) => getAreaColor(area.cubes) === color).length;
  if (kind === "focused-development") {
    const capacity = getAreaCapacity(state);
    return state.areas.filter((area) => areaTotal(area) >= capacity).length;
  }
  if (kind === "redevelopment") {
    return state.areas.filter((area) => getAreaColor(area.cubes) === "neutral").length;
  }
  return cityCountForPlayer(state, playerId);
};

const applyScoreCard = (state: GameState, action: Extract<GameAction, { type: "SCORE_CARD" }>) => {
  const player = currentPlayer(state);
  const card = takeCard(player, action.cardId);
  if (!card) return reject(state, "使用できるカードではありません。");

  const next = cloneState(state);
  const nextPlayer = currentPlayer(next);
  const nextCard = takeCard(nextPlayer, action.cardId);
  if (!nextCard) return reject(state, "使用できるカードではありません。");
  const score = scoreForCard(next, nextPlayer.id, nextCard.kind);
  nextPlayer.scoreFromCards += score;
  discardCard(nextPlayer, nextCard);
  addHistory(next, action, `${cardDefinitions[nextCard.kind].name}を評価して${score}貢献度`);
  advanceTurn(next);
  return { ok: true, state: next } as ActionResult;
};

const applyDraftPick = (
  state: GameState,
  action: Extract<GameAction, { type: "DRAFT_PICK" }>
): ActionResult => {
  const draft = state.draft;
  if (!draft) return reject(state, "ドラフトは完了しています。");
  const pack = draft.packs[draft.currentPlayerIndex];
  const card = pack.find((candidate) => candidate.id === action.cardId);
  if (!card) return reject(state, "現在の手札にないカードは選べません。");

  const next = cloneState(state);
  const nextDraft = next.draft;
  if (!nextDraft) return reject(state, "ドラフトは完了しています。");
  const nextPack = nextDraft.packs[nextDraft.currentPlayerIndex];
  const picked = nextPack.find((candidate) => candidate.id === action.cardId);
  if (!picked) return reject(state, "現在の手札にないカードは選べません。");
  next.players[nextDraft.currentPlayerIndex].cards.push(picked);
  nextDraft.packs[nextDraft.currentPlayerIndex] = nextPack.filter(
    (candidate) => candidate.id !== action.cardId
  );
  addHistory(next, action, `${cardDefinitions[picked.kind].name}をドラフト`);

  if (nextDraft.currentPlayerIndex < next.players.length - 1) {
    nextDraft.currentPlayerIndex += 1;
    next.currentPlayerIndex = nextDraft.currentPlayerIndex;
    return { ok: true, state: next };
  }

  if (nextDraft.round >= nextDraft.totalRounds) {
    next.status = "active";
    next.currentPlayerIndex = 0;
    next.draft = null;
    addHistory(next, { type: "PASS", playerId: next.players[0].id }, "ドラフト完了");
    return { ok: true, state: next };
  }

  const rotated = nextDraft.packs.map((_, index) => {
    const from = (index - 1 + next.players.length) % next.players.length;
    return nextDraft.packs[from];
  });
  nextDraft.packs = rotated;
  nextDraft.round += 1;
  nextDraft.currentPlayerIndex = 0;
  next.currentPlayerIndex = 0;
  return { ok: true, state: next };
};

export const applyAction = (state: GameState, action: GameAction): ActionResult => {
  const headerError = assertActionHeader(state, action);
  if (headerError) return reject(state, headerError);

  if (action.type === "DRAFT_PICK") return applyDraftPick(state, action);
  if (action.type === "TAKE_CUBES") return applyTakeCubes(state, action);
  if (action.type === "PLACE_CUBES") return applyPlaceCubes(state, action);
  if (action.type === "BUILD_CITY") return applyBuildCity(state, action);
  if (action.type === "SCORE_CARD") return applyScoreCard(state, action);

  const next = cloneState(state);
  addHistory(next, action, "パス");
  advanceTurn(next);
  return { ok: true, state: next };
};

const formatCubes = (cubes: PartialCubeCounts): string =>
  cubeColors
    .filter((color) => (cubes[color] ?? 0) > 0)
    .map((color) => `${color}:${cubes[color]}`)
    .join(", ");

export const getLegalInfo = (state: GameState, canUndo = false): LegalInfo => {
  const empty: LegalInfo = {
    canUndo,
    canPass: false,
    draftPickCardIds: [],
    takeOptions: [],
    placeableAreaIds: [],
    scoreableCardIds: [],
    accelerationCardIds: {},
    buildableIntersections: [],
  };

  if (state.status === "ended") return empty;

  if (state.status === "draft") {
    const draft = state.draft;
    return {
      ...empty,
      draftPickCardIds: draft ? draft.packs[draft.currentPlayerIndex].map((card) => card.id) : [],
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
  const canRedevelop = player.cards.some((card) => card.kind === "redevelopment");
  const placeableAreaIds = hasAnyHandCube
    ? state.areas
        .filter((area) => areaTotal(area) < areaCapacity || canRedevelop)
        .map((area) => area.id)
    : [];

  const accelerationCardIds: LegalInfo["accelerationCardIds"] = {
    take: player.cards
      .filter((card) => cardDefinitions[card.kind].accelerationUse === "take")
      .map((card) => card.id),
    place: player.cards
      .filter((card) => cardDefinitions[card.kind].accelerationUse === "place")
      .map((card) => card.id),
    build: player.cards
      .filter((card) => cardDefinitions[card.kind].accelerationUse === "build")
      .map((card) => card.id),
  };

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
    draftPickCardIds: [],
    takeOptions,
    placeableAreaIds,
    scoreableCardIds: player.cards.map((card) => card.id),
    accelerationCardIds,
    buildableIntersections,
  };
};

export const toPublicState = (state: GameState, canUndo = false): PublicGameState => {
  const phase = getPhase(state);
  const areaCapacity = getAreaCapacity(state);
  const activePlayer = state.status !== "ended" ? currentPlayer(state) : null;
  const players = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    hand: player.hand,
    handTotal: cubeTotal(player.hand),
    cityCount: cityCountForPlayer(state, player.id),
    scoreFromCards: player.scoreFromCards,
    projectedContribution: getContribution(state, player.id),
    cards: player.cards,
    usedCards: player.usedCards,
    turnsTaken: player.turnsTaken,
  }));
  const maxContribution = Math.max(...players.map((player) => player.projectedContribution));
  const winners =
    state.status === "ended"
      ? players.filter((player) => player.projectedContribution === maxContribution)
      : [];

  return {
    status: state.status,
    round: state.round,
    maxRounds: state.maxRounds,
    phase,
    areaCapacity,
    currentPlayerId: activePlayer?.id ?? null,
    currentPlayerName: activePlayer?.name ?? null,
    draft:
      state.status === "draft" && state.draft
        ? {
            round: state.draft.round,
            totalRounds: state.draft.totalRounds,
            currentPlayerId: state.players[state.draft.currentPlayerIndex].id,
            currentPlayerName: state.players[state.draft.currentPlayerIndex].name,
            currentPack: state.draft.packs[state.draft.currentPlayerIndex],
            pickedCounts: Object.fromEntries(state.players.map((player) => [player.id, player.cards.length])),
          }
        : null,
    players,
    supply: state.supply,
    areas: state.areas.map((area) => ({
      ...area,
      cubeTotal: areaTotal(area),
      areaColor: getAreaColor(area.cubes),
      currentPlacementLimit: activePlayer ? getPlacementLimit(state, activePlayer.id, area.id) : 3,
      hasCurrentPlayerCityBonus: activePlayer
        ? hasCityPlacementBonus(state, activePlayer.id, area.id)
        : false,
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
