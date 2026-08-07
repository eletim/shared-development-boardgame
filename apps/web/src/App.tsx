import { useEffect, useState } from "react";
import { RotateCcw, Undo2, UserPlus } from "lucide-react";
import {
  cubeColors,
  type AreaColor,
  type CardSummary,
  type CardUseMode,
  type CubeColor,
  type GameAction,
  type GameResponse,
  type PartialCubeCounts,
  type PublicGameState,
} from "@sdb/protocol";

type BoardMode = "placement" | "build" | "none";

const colorLabels: Record<CubeColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
};

const areaColorLabels: Record<AreaColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  neutral: "中立",
};

const getAreaCapacityForBoardTotal = (boardCubeTotal: number): number => {
  if (boardCubeTotal <= 13) return 3;
  if (boardCubeTotal <= 27) return 5;
  return 7;
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

const formatCubes = (cubes: PartialCubeCounts): string =>
  cubeColors
    .filter((color) => (cubes[color] ?? 0) > 0)
    .map((color) => `${colorLabels[color]}${cubes[color]}`)
    .join(" ");

export const App = () => {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState<string>("");
  const [playerCount, setPlayerCount] = useState(2);
  const [names, setNames] = useState(["Player 1", "Player 2", "Player 3", "Player 4"]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [useMode, setUseMode] = useState<CardUseMode>("development");
  const [basicColor, setBasicColor] = useState<CubeColor>("red");
  const [endPlacementAreaId, setEndPlacementAreaId] = useState("");
  const [endPlacementColor, setEndPlacementColor] = useState<CubeColor>("red");
  const [buildIntersectionId, setBuildIntersectionId] = useState("");

  useEffect(() => {
    api("/api/game").then((data) => {
      setState(data.state);
      setError(data.error ?? "");
    });
  }, []);

  const currentPlayer = state?.players.find((player) => player.id === state.currentPlayerId) ?? null;

  useEffect(() => {
    const firstCard = currentPlayer?.handCards[0]?.instanceId ?? "";
    setSelectedCardId(firstCard);
    setUseMode("development");
    setBasicColor("red");
    setEndPlacementAreaId("");
    setEndPlacementColor("red");
    setBuildIntersectionId("");
  }, [state?.currentPlayerId, state?.phase, state?.round]);

  const selectedCardForAction = currentPlayer?.handCards.find((card) => card.instanceId === selectedCardId) ?? null;
  const endPlacementCapacity = state ? getAreaCapacityForBoardTotal(state.boardCubeTotal + 1) : 0;
  const selectedEndPlacementArea =
    state?.areas.find((area) => area.id === endPlacementAreaId) ?? null;
  const placeableAreaIds =
    state?.areas
      .filter((area) => area.cubeTotal + 1 <= endPlacementCapacity)
      .map((area) => area.id) ?? [];
  const canPlaceSelectedArea =
    !!selectedEndPlacementArea && selectedEndPlacementArea.cubeTotal + 1 <= endPlacementCapacity;

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

  const draftPick = (card: CardSummary) => {
    if (!state?.currentPlayerId) return;
    void sendAction({
      type: "DRAFT_PICK",
      playerId: state.currentPlayerId,
      cardInstanceId: card.instanceId,
    });
  };

  const confirmUseCard = () => {
    if (!state?.currentPlayerId || !selectedCardForAction) return;
    const action: Extract<GameAction, { type: "USE_CARD" }> = {
      type: "USE_CARD",
      playerId: state.currentPlayerId,
      cardInstanceId: selectedCardForAction.instanceId,
      mode: useMode,
    };
    if (useMode === "basic") action.basicColor = basicColor;
    void sendAction(action);
  };

  const confirmBuild = () => {
    if (!state?.currentPlayerId || !buildIntersectionId) return;
    void sendAction({
      type: "BUILD_CITY",
      playerId: state.currentPlayerId,
      intersectionId: buildIntersectionId,
    });
  };

  const endTurn = (withPlacement: boolean) => {
    if (!state?.currentPlayerId) return;
    const action: Extract<GameAction, { type: "END_TURN" }> = {
      type: "END_TURN",
      playerId: state.currentPlayerId,
    };
    if (withPlacement) {
      action.placement = {
        areaId: endPlacementAreaId,
        color: endPlacementColor,
      };
    }
    void sendAction(action);
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Hex Cube Cities</h1>
          <p>
            Round {state.round} / {state.maxRounds} · {state.phase === "draft" ? "ドラフト" : state.phase === "action" ? "アクション" : "終了"} · 世界Lv {state.worldLevel} ·
            都市Lv {state.cityLevel} · 容量 {state.areaCapacity} · 盤面 {state.boardCubeTotal}
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
                  {colorLabels[color]} {player.cubes[color]}
                </span>
              ))}
            </div>
            <p>
              都市 {player.cityCount} · 貢献 {player.contribution} · 最終 {player.finalScore} · 手札 {player.handCards.length}
            </p>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="left-panel">
          <section className="production">
            <h2>都市生産</h2>
            {state.lastProduction.map((entry) => (
              <p key={entry.playerId}>
                <strong>{entry.playerName}</strong> {formatCubes(entry.cubes) || "なし"}
              </p>
            ))}
          </section>

          {state.phase === "draft" ? (
            <section className="actions">
              <h2>ドラフト {state.draftPickNumber} / 8</h2>
              <div className="card-list">
                {state.legal.draftPack.map((card) => (
                  <button key={card.instanceId} className="card-button" onClick={() => draftPick(card)}>
                    <strong>{card.name}</strong>
                    <span>{card.developmentText}</span>
                    <span>{card.scoringText}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {state.phase === "action" ? (
            <section className="actions">
              <h2>カード手番</h2>
              {state.turnCardUsed ? <p className="hint">カード使用済み。都市建設後に手番終了できます。</p> : null}
              <label>
                手札
                <select
                  value={selectedCardId}
                  onChange={(event) => setSelectedCardId(event.target.value)}
                  disabled={state.turnCardUsed}
                >
                  {currentPlayer?.handCards.map((card) => (
                    <option key={card.instanceId} value={card.instanceId}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedCardForAction ? (
                <article className="selected-card">
                  <strong>{selectedCardForAction.name}</strong>
                  <span>{selectedCardForAction.developmentText}</span>
                  <span>{selectedCardForAction.scoringText}</span>
                </article>
              ) : null}
              <div className="mode-tabs" role="tablist" aria-label="カード用途">
                {(["development", "scoring", "basic"] as CardUseMode[]).map((candidate) => (
                  <button
                    key={candidate}
                    className={useMode === candidate ? "selected" : ""}
                    onClick={() => setUseMode(candidate)}
                    disabled={state.turnCardUsed}
                  >
                    {candidate === "development" ? "生産" : candidate === "scoring" ? "得点" : "基本取得"}
                  </button>
                ))}
              </div>

              {useMode === "basic" ? (
                <label>
                  取得色
                  <select value={basicColor} onChange={(event) => setBasicColor(event.target.value as CubeColor)}>
                    {cubeColors.map((color) => (
                      <option key={color} value={color}>
                        {colorLabels[color]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <button className="primary wide" onClick={confirmUseCard} disabled={!state.legal.canUseCard || !selectedCardForAction}>
                カードを使用
              </button>
            </section>
          ) : null}

          {state.phase === "action" && state.turnCardUsed ? (
            <section className="actions">
              <h2>ターン終了時配置</h2>
              <div className="payment-grid">
                <label>
                  色
                  <select value={endPlacementColor} onChange={(event) => setEndPlacementColor(event.target.value as CubeColor)}>
                    {cubeColors.map((color) => (
                      <option key={color} value={color}>
                        {colorLabels[color]} {currentPlayer?.cubes[color] ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  エリア
                  <select value={endPlacementAreaId} onChange={(event) => setEndPlacementAreaId(event.target.value)}>
                    <option value="">選択</option>
                    {state.areas.map((area) => (
                      <option key={area.id} value={area.id} disabled={!placeableAreaIds.includes(area.id)}>
                        {area.label} {area.cubeTotal}/{endPlacementCapacity}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="primary wide"
                onClick={() => endTurn(true)}
                disabled={
                  !state.legal.canEndTurn ||
                  !endPlacementAreaId ||
                  !canPlaceSelectedArea ||
                  (currentPlayer?.cubes[endPlacementColor] ?? 0) < 1
                }
              >
                1個置いて手番終了
              </button>
              <button className="secondary wide" onClick={() => endTurn(false)} disabled={!state.legal.canEndTurn}>
                置かずに手番終了
              </button>
            </section>
          ) : null}

          {state.phase === "action" ? (
            <section className="actions">
              <h2>都市建設</h2>
              <label>
                交点
                <select value={buildIntersectionId} onChange={(event) => setBuildIntersectionId(event.target.value)}>
                  <option value="">選択</option>
                  {state.intersections
                    .filter((intersection) => !intersection.city)
                    .map((intersection) => (
                      <option
                        key={intersection.id}
                        value={intersection.id}
                        disabled={!state.legal.buildableIntersectionIds.includes(intersection.id)}
                      >
                        {intersection.id}
                      </option>
                    ))}
                </select>
              </label>
              <p className="hint">コスト: 赤1 青1 黄1。カードは消費しません。</p>
              <button
                className="primary wide"
                onClick={confirmBuild}
                disabled={
                  !state.legal.canBuildCity ||
                  !buildIntersectionId ||
                  !state.legal.buildableIntersectionIds.includes(buildIntersectionId)
                }
              >
                都市を建設
              </button>
            </section>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
        </aside>

        <Board
          state={state}
          mode={state.turnCardUsed ? "placement" : "build"}
          selectedAreaId={endPlacementAreaId}
          selectedIntersectionId={buildIntersectionId}
          placeableAreaIds={placeableAreaIds}
          onAreaSelect={setEndPlacementAreaId}
          onIntersectionSelect={setBuildIntersectionId}
        />

        <aside className="right-panel">
          {state.status === "ended" ? (
            <section className="results">
              <h2>結果</h2>
              <p>勝者: {state.winners.map((winner) => winner.name).join(", ")}</p>
              {state.players.map((player) => (
                <p key={player.id}>
                  {player.name}: 貢献 {player.contribution} + 都市 {player.cityCount} = {player.finalScore}
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

const Board = ({
  state,
  mode,
  selectedAreaId,
  selectedIntersectionId,
  placeableAreaIds,
  onAreaSelect,
  onIntersectionSelect,
}: {
  state: PublicGameState;
  mode: BoardMode;
  selectedAreaId: string;
  selectedIntersectionId: string;
  placeableAreaIds: string[];
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
            state.status === "active" && mode === "placement" && placeableAreaIds.includes(area.id);
          return (
            <g key={area.id}>
              <polygon
                points={points}
                className={`hex ${area.areaColor} ${selectable ? "selectable" : ""} ${selectedAreaId === area.id ? "selected" : ""}`}
                onClick={() => selectable && onAreaSelect(area.id)}
              />
              <text x={area.x} y={area.y - 36} className="area-label">
                {area.label}
              </text>
              <text x={area.x} y={area.y - 13} className="area-count">
                {areaColorLabels[area.areaColor]} {area.cubeTotal}/{state.areaCapacity}
              </text>
              {cubeColors.map((color, index) => (
                <g key={color} transform={`translate(${area.x - 38 + index * 38} ${area.y + 24})`}>
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
          const legalBuild = state.legal.buildableIntersectionIds.includes(intersection.id);
          const selectable =
            state.status === "active" && mode === "build" && !intersection.city && legalBuild;
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
