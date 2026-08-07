import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Undo2, UserPlus } from "lucide-react";
import {
  cardDefinitions,
  type CardInstance,
  cubeColors,
  type CubeColor,
  type GameAction,
  type GameResponse,
  type PartialCubeCounts,
  type PublicGameState,
} from "@sdb/protocol";

type Mode = "take" | "place" | "build" | "score" | "pass";

const colorLabels: Record<CubeColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
};

const api = async (path: string, body?: unknown): Promise<GameResponse> => {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json()) as GameResponse;
  if (!response.ok) {
    return { state: data.state ?? null, error: data.error ?? "操作に失敗しました。" };
  }
  return data;
};

const emptyCounts = (): Record<CubeColor, number> => ({ red: 0, blue: 0, yellow: 0 });

const formatCubes = (cubes: PartialCubeCounts): string =>
  cubeColors
    .filter((color) => (cubes[color] ?? 0) > 0)
    .map((color) => `${colorLabels[color]}${cubes[color]}`)
    .join(" ");

const cardLabel = (card: CardInstance): string => cardDefinitions[card.kind].name;

export const App = () => {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState<string>("");
  const [playerCount, setPlayerCount] = useState(2);
  const [names, setNames] = useState(["Player 1", "Player 2", "Player 3", "Player 4"]);
  const [mode, setMode] = useState<Mode>("take");
  const [takeIndex, setTakeIndex] = useState(0);
  const [placeAreaId, setPlaceAreaId] = useState<string>("");
  const [placeCubes, setPlaceCubes] = useState(emptyCounts);
  const [buildIntersectionId, setBuildIntersectionId] = useState<string>("");
  const [payment, setPayment] = useState<Record<CubeColor, string>>({
    red: "",
    blue: "",
    yellow: "",
  });
  const [accelerateCardId, setAccelerateCardId] = useState("");
  const [scoreCardId, setScoreCardId] = useState("");
  const [waivedColor, setWaivedColor] = useState<CubeColor | "">("");
  const [redevelopmentMove, setRedevelopmentMove] = useState({
    color: "red" as CubeColor,
    fromAreaId: "",
    toAreaId: "",
  });

  useEffect(() => {
    api("/api/game").then((data) => {
      setState(data.state);
      setError(data.error ?? "");
    });
  }, []);

  useEffect(() => {
    setTakeIndex(0);
    setPlaceAreaId("");
    setPlaceCubes(emptyCounts());
    setBuildIntersectionId("");
    setPayment({ red: "", blue: "", yellow: "" });
    setAccelerateCardId("");
    setScoreCardId("");
    setWaivedColor("");
    setRedevelopmentMove({ color: "red", fromAreaId: "", toAreaId: "" });
  }, [state?.currentPlayerId, state?.round]);

  const currentPlayer = state?.players.find((player) => player.id === state.currentPlayerId) ?? null;
  const selectedIntersection = state?.intersections.find(
    (intersection) => intersection.id === buildIntersectionId
  );
  const isActive = state?.status === "active";
  const placeTotal = cubeColors.reduce((total, color) => total + placeCubes[color], 0);
  const selectedPlaceArea = state?.areas.find((area) => area.id === placeAreaId);
  const selectedAccelerator = currentPlayer?.cards.find((card) => card.id === accelerateCardId);
  const placeLimit = selectedPlaceArea
    ? selectedPlaceArea.currentPlacementLimit +
      (selectedAccelerator?.kind === "focused-development" ? 1 : 0)
    : 3;
  const selectedPlaceAreaIsLegal =
    Boolean(placeAreaId) && Boolean(state?.legal.placeableAreaIds.includes(placeAreaId));
  const legalBuildByIntersectionId = new Map(
    state?.legal.buildableIntersections.map((option) => [option.intersectionId, option]) ?? []
  );
  const selectedBuildOption = buildIntersectionId
    ? legalBuildByIntersectionId.get(buildIntersectionId)
    : undefined;
  const selectedBuildIsLegal =
    Boolean(selectedBuildOption) && selectedBuildOption?.missingColors.length === 0;
  const buildUsesUrbanization = selectedAccelerator?.kind === "urbanization";

  const selectedIntersectionAreas = useMemo(() => {
    if (!state || !selectedIntersection) return [];
    return selectedIntersection.adjacentAreaIds
      .map((areaId) => state.areas.find((area) => area.id === areaId))
      .filter((area): area is PublicGameState["areas"][number] => Boolean(area));
  }, [selectedIntersection, state]);

  const applyResponse = (data: GameResponse) => {
    if (data.state !== undefined) setState(data.state);
    setError(data.error ?? "");
  };

  const startGame = async () => {
    const data = await api("/api/game/start", {
      playerNames: names.slice(0, playerCount),
    });
    applyResponse(data);
  };

  const sendAction = async (action: GameAction) => {
    const data = await api("/api/game/actions", { action });
    applyResponse(data);
  };

  const reset = async () => applyResponse(await api("/api/game/reset", {}));
  const undo = async () => applyResponse(await api("/api/game/undo", {}));
  const newGame = () => {
    setState(null);
    setError("");
  };

  const confirmTake = () => {
    if (!state?.currentPlayerId) return;
    const cubes = state.legal.takeOptions[takeIndex];
    if (!cubes) return;
    void sendAction({
      type: "TAKE_CUBES",
      playerId: state.currentPlayerId,
      cubes,
      accelerateCardId: accelerateCardId || undefined,
    });
  };

  const confirmPlace = () => {
    if (!state?.currentPlayerId || !placeAreaId) return;
    void sendAction({
      type: "PLACE_CUBES",
      playerId: state.currentPlayerId,
      areaId: placeAreaId,
      cubes: placeCubes,
      accelerateCardId: accelerateCardId || undefined,
      redevelopmentMove:
        selectedAccelerator?.kind === "redevelopment"
          ? redevelopmentMove
          : undefined,
    });
  };

  const confirmBuild = () => {
    if (!state?.currentPlayerId || !buildIntersectionId) return;
    void sendAction({
      type: "BUILD_CITY",
      playerId: state.currentPlayerId,
      intersectionId: buildIntersectionId,
      payment,
      accelerateCardId: accelerateCardId || undefined,
      waivedColor: waivedColor || undefined,
    });
  };

  const confirmScore = () => {
    if (!state?.currentPlayerId || !scoreCardId) return;
    void sendAction({ type: "SCORE_CARD", playerId: state.currentPlayerId, cardId: scoreCardId });
  };

  const pickDraftCard = (cardId: string) => {
    if (!state?.currentPlayerId) return;
    void sendAction({ type: "DRAFT_PICK", playerId: state.currentPlayerId, cardId });
  };

  if (!state) {
    return (
      <main className="setup-shell">
        <section className="setup-panel" aria-label="ゲーム開始">
          <h1>Hex Cube Cities</h1>
          <label>
            プレイヤー人数
            <select value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))}>
              {[2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <div className="name-grid">
            {Array.from({ length: playerCount }, (_, index) => (
              <label key={index}>
                Player {index + 1}
                <input
                  value={names[index]}
                  onChange={(event) => {
                    const next = [...names];
                    next[index] = event.target.value;
                    setNames(next);
                  }}
                />
              </label>
            ))}
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" onClick={startGame}>
            ゲーム開始
          </button>
        </section>
      </main>
    );
  }

  if (state.status === "draft" && state.draft) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <h1>Hex Cube Cities</h1>
            <p>
              Draft {state.draft.round} / {state.draft.totalRounds}
            </p>
          </div>
          <div className="turn-block">
            <span>選択</span>
            <strong>{state.draft.currentPlayerName}</strong>
          </div>
          <div className="icon-actions">
            <button aria-label="New game" onClick={newGame}>
              <UserPlus size={18} />
            </button>
            <button aria-label="Undo" onClick={undo} disabled={!state.legal.canUndo}>
              <Undo2 size={18} />
            </button>
            <button aria-label="Reset" onClick={reset}>
              <RotateCcw size={18} />
            </button>
          </div>
        </header>
        <section className="player-strip" aria-label="ドラフト状況">
          {state.players.map((player) => (
            <article
              key={player.id}
              className={`player-card ${player.id === state.currentPlayerId ? "active" : ""}`}
              style={{ borderTopColor: player.color }}
            >
              <div className="player-name">
                <span style={{ backgroundColor: player.color }} />
                <strong>{player.name}</strong>
              </div>
              <p>選択済み {state.draft?.pickedCounts[player.id] ?? 0} / 4</p>
              <div className="mini-card-list">
                {player.cards.map((card) => (
                  <span key={card.id}>{cardLabel(card)}</span>
                ))}
              </div>
            </article>
          ))}
        </section>
        <section className="draft-panel">
          <h2>{state.draft.currentPlayerName} の手札</h2>
          <div className="card-grid">
            {state.draft.currentPack.map((card) => (
              <CardButton
                key={card.id}
                card={card}
                onClick={() => pickDraftCard(card.id)}
                disabled={!state.legal.draftPickCardIds.includes(card.id)}
              />
            ))}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Hex Cube Cities</h1>
          <p>
            Round {state.round} / {state.maxRounds} · Phase {state.phase} · 容量 {state.areaCapacity}
          </p>
        </div>
        <div className="turn-block">
          <span>手番</span>
          <strong>{state.currentPlayerName ?? "終了"}</strong>
        </div>
        <div className="icon-actions">
          <button aria-label="New game" onClick={newGame}>
            <UserPlus size={18} />
          </button>
          <button aria-label="Undo" onClick={undo} disabled={!state.legal.canUndo}>
            <Undo2 size={18} />
          </button>
          <button aria-label="Reset" onClick={reset}>
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <section className="player-strip" aria-label="プレイヤー">
        {state.players.map((player) => (
          <article
            key={player.id}
            className={`player-card ${player.id === state.currentPlayerId ? "active" : ""}`}
            style={{ borderTopColor: player.color }}
          >
            <div className="player-name">
              <span style={{ backgroundColor: player.color }} />
              <strong>{player.name}</strong>
            </div>
            <div className="cube-row">
              {cubeColors.map((color) => (
                <span key={color} className={`cube-pill ${color}`}>
                  {colorLabels[color]} {player.hand[color]}
                </span>
              ))}
            </div>
            <p>
              手元 {player.handTotal} / 10 · 街 {player.cityCount} · 評価 {player.scoreFromCards} · 合計{" "}
              {player.projectedContribution}
            </p>
            <div className="mini-card-list">
              {player.cards.map((card) => (
                <span key={card.id}>{cardLabel(card)}</span>
              ))}
              {player.cards.length === 0 ? <span>未使用なし</span> : null}
            </div>
            <p>使用済み {player.usedCards.length} · 手番 {player.turnsTaken}</p>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="left-panel">
          <section className="supply">
            <h2>共通供給</h2>
            <div className="cube-row">
              {cubeColors.map((color) => (
                <span key={color} className={`cube-pill ${color}`}>
                  {colorLabels[color]} {state.supply[color]}
                </span>
              ))}
            </div>
          </section>

          <section className="actions">
            <div className="mode-tabs" role="tablist" aria-label="アクション">
              {(["take", "place", "build", "score", "pass"] as Mode[]).map((candidate) => (
                <button
                  key={candidate}
                  className={mode === candidate ? "selected" : ""}
                  onClick={() => {
                    setMode(candidate);
                    setAccelerateCardId("");
                  }}
                >
                  {candidate === "take"
                    ? "取る"
                    : candidate === "place"
                      ? "置く"
                      : candidate === "build"
                        ? "建設"
                        : candidate === "score"
                          ? "評価"
                          : "パス"}
                </button>
              ))}
            </div>

            {mode === "take" ? (
              <div className="action-form">
                <label>
                  取得
                  <select value={takeIndex} onChange={(event) => setTakeIndex(Number(event.target.value))}>
                    {state.legal.takeOptions.map((option, index) => (
                      <option key={index} value={index}>
                        {formatCubes(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <AcceleratorSelect
                  cards={currentPlayer?.cards ?? []}
                  allowedIds={state.legal.accelerationCardIds.take ?? []}
                  value={accelerateCardId}
                  onChange={setAccelerateCardId}
                />
                <button className="primary" onClick={confirmTake} disabled={state.legal.takeOptions.length === 0}>
                  確定
                </button>
              </div>
            ) : null}

            {mode === "place" ? (
              <div className="action-form">
                <label>
                  エリア
                  <select value={placeAreaId} onChange={(event) => setPlaceAreaId(event.target.value)}>
                    <option value="">選択</option>
                    {state.areas.map((area) => (
                      <option
                        key={area.id}
                        value={area.id}
                        disabled={!state.legal.placeableAreaIds.includes(area.id)}
                      >
                        {area.label} {area.cubeTotal}/{state.areaCapacity} · 最大{area.currentPlacementLimit}
                      </option>
                    ))}
                  </select>
                </label>
                <AcceleratorSelect
                  cards={currentPlayer?.cards ?? []}
                  allowedIds={state.legal.accelerationCardIds.place ?? []}
                  value={accelerateCardId}
                  onChange={setAccelerateCardId}
                />
                {selectedAccelerator?.kind === "redevelopment" ? (
                  <div className="payment-grid">
                    <label>
                      移動色
                      <select
                        value={redevelopmentMove.color}
                        onChange={(event) =>
                          setRedevelopmentMove({
                            ...redevelopmentMove,
                            color: event.target.value as CubeColor,
                          })
                        }
                      >
                        {cubeColors.map((color) => (
                          <option key={color} value={color}>
                            {colorLabels[color]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      移動元
                      <select
                        value={redevelopmentMove.fromAreaId}
                        onChange={(event) =>
                          setRedevelopmentMove({ ...redevelopmentMove, fromAreaId: event.target.value })
                        }
                      >
                        <option value="">選択</option>
                        {state.areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      移動先
                      <select
                        value={redevelopmentMove.toAreaId}
                        onChange={(event) =>
                          setRedevelopmentMove({ ...redevelopmentMove, toAreaId: event.target.value })
                        }
                      >
                        <option value="">選択</option>
                        {state.areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                <CubeInputs counts={placeCubes} setCounts={setPlaceCubes} maxByColor={currentPlayer?.hand ?? emptyCounts()} />
                <p className="hint">この配置の最大数: {placeLimit}</p>
                <button
                  className="primary"
                  onClick={confirmPlace}
                  disabled={
                    !isActive ||
                    !selectedPlaceAreaIsLegal ||
                    placeTotal < 1 ||
                    placeTotal > placeLimit ||
                    (selectedAccelerator?.kind === "redevelopment" &&
                      (!redevelopmentMove.fromAreaId || !redevelopmentMove.toAreaId))
                  }
                >
                  確定
                </button>
              </div>
            ) : null}

            {mode === "build" ? (
              <div className="action-form">
                <AcceleratorSelect
                  cards={currentPlayer?.cards ?? []}
                  allowedIds={state.legal.accelerationCardIds.build ?? []}
                  value={accelerateCardId}
                  onChange={setAccelerateCardId}
                />
                {buildUsesUrbanization ? (
                  <label>
                    免除色
                    <select value={waivedColor} onChange={(event) => setWaivedColor(event.target.value as CubeColor)}>
                      <option value="">選択</option>
                      {cubeColors.map((color) => (
                        <option key={color} value={color}>
                          {colorLabels[color]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  交点
                  <select
                    value={buildIntersectionId}
                    onChange={(event) => {
                      setBuildIntersectionId(event.target.value);
                      setPayment({ red: "", blue: "", yellow: "" });
                    }}
                  >
                    <option value="">選択</option>
                    {state.intersections
                      .filter((intersection) => !intersection.city)
                      .map((intersection) => {
                        const option = legalBuildByIntersectionId.get(intersection.id);
                        const missing = option?.missingColors ?? cubeColors;
                        return (
                        <option
                          key={intersection.id}
                          value={intersection.id}
                          disabled={missing.length > 0 && !(buildUsesUrbanization && missing.length <= 1)}
                        >
                          {intersection.id}
                        </option>
                      );
                      })}
                  </select>
                </label>
                {selectedIntersection ? (
                  <div className="payment-grid">
                    {cubeColors.map((color) => (
                      <label key={color}>
                        {colorLabels[color]}
                        <select
                          value={payment[color]}
                          disabled={waivedColor === color}
                          onChange={(event) => setPayment({ ...payment, [color]: event.target.value })}
                        >
                          <option value="">{waivedColor === color ? "免除" : "支払い元"}</option>
                          {selectedIntersectionAreas.map((area) => (
                            <option key={area.id} value={area.id} disabled={area.cubes[color] < 1}>
                              {area.label} ({area.cubes[color]})
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
                <button
                  className="primary"
                  onClick={confirmBuild}
                  disabled={
                    !isActive ||
                    !selectedBuildOption ||
                    (buildUsesUrbanization && !waivedColor) ||
                    (!buildUsesUrbanization && !selectedBuildIsLegal) ||
                    (buildUsesUrbanization &&
                      selectedBuildOption.missingColors.some((color) => color !== waivedColor)) ||
                    cubeColors.some((color) => waivedColor !== color && !payment[color])
                  }
                >
                  確定
                </button>
              </div>
            ) : null}

            {mode === "score" ? (
              <div className="action-form">
                <label>
                  評価カード
                  <select value={scoreCardId} onChange={(event) => setScoreCardId(event.target.value)}>
                    <option value="">選択</option>
                    {(currentPlayer?.cards ?? []).map((card) => (
                      <option key={card.id} value={card.id}>
                        {cardLabel(card)}
                      </option>
                    ))}
                  </select>
                </label>
                {currentPlayer?.cards.length ? (
                  <div className="card-list">
                    {currentPlayer.cards.map((card) => (
                      <CardButton key={card.id} card={card} selected={card.id === scoreCardId} onClick={() => setScoreCardId(card.id)} />
                    ))}
                  </div>
                ) : null}
                <button className="primary" onClick={confirmScore} disabled={!isActive || !scoreCardId}>
                  評価する
                </button>
              </div>
            ) : null}

            {mode === "pass" ? (
              <button
                className="primary wide"
                disabled={!state.legal.canPass}
                onClick={() =>
                  state.currentPlayerId &&
                  void sendAction({ type: "PASS", playerId: state.currentPlayerId })
                }
              >
                パス
              </button>
            ) : null}

            {error ? <p className="error">{error}</p> : null}
          </section>
        </aside>

        <Board
          state={state}
          mode={mode}
          selectedAreaId={placeAreaId}
          selectedIntersectionId={buildIntersectionId}
          onAreaSelect={setPlaceAreaId}
          onIntersectionSelect={(id) => {
            setBuildIntersectionId(id);
            setPayment({ red: "", blue: "", yellow: "" });
          }}
        />

        <aside className="right-panel">
          {state.status === "ended" ? (
            <section className="results">
              <h2>結果</h2>
              <p>勝者: {state.winners.map((winner) => winner.name).join(", ")}</p>
              {state.players.map((player) => (
                <p key={player.id}>
                  {player.name}: 街 {player.cityCount}
                </p>
              ))}
            </section>
          ) : null}
          <section className="history">
            <h2>行動履歴</h2>
            {state.history.length === 0 ? <p>なし</p> : null}
            {state.history.map((entry) => (
              <article key={entry.id}>
                <strong>R{entry.round} {entry.playerName}</strong>
                <span>{entry.summary}</span>
              </article>
            ))}
          </section>
        </aside>
      </section>
    </main>
  );
};

const AcceleratorSelect = ({
  cards,
  allowedIds,
  value,
  onChange,
}: {
  cards: CardInstance[];
  allowedIds: string[];
  value: string;
  onChange: (value: string) => void;
}) => {
  const allowed = cards.filter((card) => allowedIds.includes(card.id));
  return (
    <label>
      加速カード
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">使わない</option>
        {allowed.map((card) => (
          <option key={card.id} value={card.id}>
            {cardLabel(card)}
          </option>
        ))}
      </select>
    </label>
  );
};

const CardButton = ({
  card,
  selected = false,
  disabled = false,
  onClick,
}: {
  card: CardInstance;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => {
  const definition = cardDefinitions[card.kind];
  return (
    <button
      type="button"
      className={`rule-card ${selected ? "selected" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <strong>{definition.name}</strong>
      <span>加速: {definition.accelerationText}</span>
      <span>評価: {definition.scoringText}</span>
    </button>
  );
};

const CubeInputs = ({
  counts,
  setCounts,
  maxByColor,
}: {
  counts: Record<CubeColor, number>;
  setCounts: (counts: Record<CubeColor, number>) => void;
  maxByColor: Record<CubeColor, number>;
}) => (
  <div className="payment-grid">
    {cubeColors.map((color) => (
      <label key={color}>
        {colorLabels[color]}
        <input
          type="number"
          min={0}
          max={maxByColor[color]}
          value={counts[color]}
          onChange={(event) =>
            setCounts({
              ...counts,
              [color]: Number(event.target.value),
            })
          }
        />
      </label>
    ))}
  </div>
);

const Board = ({
  state,
  mode,
  selectedAreaId,
  selectedIntersectionId,
  onAreaSelect,
  onIntersectionSelect,
}: {
  state: PublicGameState;
  mode: Mode;
  selectedAreaId: string;
  selectedIntersectionId: string;
  onAreaSelect: (id: string) => void;
  onIntersectionSelect: (id: string) => void;
}) => {
  const xCoordinates = [...state.areas.map((area) => area.x), ...state.intersections.map((item) => item.x)];
  const yCoordinates = [...state.areas.map((area) => area.y), ...state.intersections.map((item) => item.y)];
  const minX = Math.min(...xCoordinates) - 130;
  const maxX = Math.max(...xCoordinates) + 130;
  const minY = Math.min(...yCoordinates) - 130;
  const maxY = Math.max(...yCoordinates) + 130;

  return (
    <section className="board-panel" aria-label="盤面">
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="六角形盤面">
        {state.areas.map((area) => {
          const points = Array.from({ length: 6 }, (_, index) => {
            const angle = ((30 + index * 60) * Math.PI) / 180;
            return `${area.x + 86 * Math.cos(angle)},${area.y + 86 * Math.sin(angle)}`;
          }).join(" ");
          const selectable =
            state.status === "active" &&
            mode === "place" &&
            state.legal.placeableAreaIds.includes(area.id);
          return (
            <g key={area.id}>
              <polygon
                points={points}
                className={`hex ${area.areaColor} ${selectable ? "selectable" : ""} ${area.hasCurrentPlayerCityBonus ? "city-bonus" : ""} ${selectedAreaId === area.id ? "selected" : ""}`}
                onClick={() => selectable && onAreaSelect(area.id)}
              />
              <text x={area.x} y={area.y - 30} className="area-label">
                {area.label}
              </text>
              <text x={area.x} y={area.y - 7} className="area-count">
                {area.cubeTotal}/{state.areaCapacity}
              </text>
              <text x={area.x} y={area.y + 13} className="area-color-label">
                {area.areaColor === "neutral" ? "中立" : colorLabels[area.areaColor]} · 最大{area.currentPlacementLimit}
              </text>
              {cubeColors.map((color, index) => (
                <g key={color} transform={`translate(${area.x - 38 + index * 38} ${area.y + 43})`}>
                  <rect className={`cube-icon ${color}`} x="-13" y="-13" width="26" height="26" rx="4" />
                  <text className="cube-text" y="5">
                    {area.cubes[color]}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
        {state.intersections.map((intersection) => {
          const legalBuild = state.legal.buildableIntersections.find(
            (option) => option.intersectionId === intersection.id && option.missingColors.length === 0
          );
          const selectable =
            state.status === "active" && mode === "build" && !intersection.city && Boolean(legalBuild);
          return (
            <g
              key={intersection.id}
              className={`intersection ${selectable ? "selectable" : ""} ${selectedIntersectionId === intersection.id ? "selected" : ""}`}
              onClick={() => selectable && onIntersectionSelect(intersection.id)}
            >
              <circle
                cx={intersection.x}
                cy={intersection.y}
                r={intersection.city ? 15 : legalBuild ? 10 : 7}
                fill={intersection.city?.playerColor ?? "#ffffff"}
              />
              <title>{intersection.id}</title>
            </g>
          );
        })}
      </svg>
    </section>
  );
};
