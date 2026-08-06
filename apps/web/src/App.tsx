import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Undo2, UserPlus } from "lucide-react";
import {
  cubeColors,
  type CubeColor,
  type GameAction,
  type GameResponse,
  type PartialCubeCounts,
  type PublicGameState,
} from "@sdb/protocol";

type Mode = "take" | "place" | "build" | "pass";

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
  }, [state?.currentPlayerId, state?.round]);

  const currentPlayer = state?.players.find((player) => player.id === state.currentPlayerId) ?? null;
  const selectedIntersection = state?.intersections.find(
    (intersection) => intersection.id === buildIntersectionId
  );
  const isActive = state?.status === "active";
  const placeTotal = cubeColors.reduce((total, color) => total + placeCubes[color], 0);
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
    void sendAction({ type: "TAKE_CUBES", playerId: state.currentPlayerId, cubes });
  };

  const confirmPlace = () => {
    if (!state?.currentPlayerId || !placeAreaId) return;
    void sendAction({
      type: "PLACE_CUBES",
      playerId: state.currentPlayerId,
      areaId: placeAreaId,
      cubes: placeCubes,
    });
  };

  const confirmBuild = () => {
    if (!state?.currentPlayerId || !buildIntersectionId) return;
    void sendAction({
      type: "BUILD_CITY",
      playerId: state.currentPlayerId,
      intersectionId: buildIntersectionId,
      payment,
    });
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
              手元 {player.handTotal} / 10 · 街 {player.cityCount} · 手番 {player.turnsTaken}
            </p>
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
              {(["take", "place", "build", "pass"] as Mode[]).map((candidate) => (
                <button
                  key={candidate}
                  className={mode === candidate ? "selected" : ""}
                  onClick={() => setMode(candidate)}
                >
                  {candidate === "take" ? "取る" : candidate === "place" ? "置く" : candidate === "build" ? "建設" : "パス"}
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
                        {area.label} {area.cubeTotal}/{state.areaCapacity}
                      </option>
                    ))}
                  </select>
                </label>
                <CubeInputs counts={placeCubes} setCounts={setPlaceCubes} maxByColor={currentPlayer?.hand ?? emptyCounts()} />
                <button
                  className="primary"
                  onClick={confirmPlace}
                  disabled={!isActive || !selectedPlaceAreaIsLegal || placeTotal < 1 || placeTotal > 3}
                >
                  確定
                </button>
              </div>
            ) : null}

            {mode === "build" ? (
              <div className="action-form">
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
                          disabled={missing.length > 0}
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
                          onChange={(event) => setPayment({ ...payment, [color]: event.target.value })}
                        >
                          <option value="">支払い元</option>
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
                    !selectedBuildIsLegal ||
                    cubeColors.some((color) => !payment[color])
                  }
                >
                  確定
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
                className={`hex ${selectable ? "selectable" : ""} ${selectedAreaId === area.id ? "selected" : ""}`}
                onClick={() => selectable && onAreaSelect(area.id)}
              />
              <text x={area.x} y={area.y - 30} className="area-label">
                {area.label}
              </text>
              <text x={area.x} y={area.y - 7} className="area-count">
                {area.cubeTotal}/{state.areaCapacity}
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
