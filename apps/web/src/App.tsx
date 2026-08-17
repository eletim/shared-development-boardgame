import { Children, useEffect, useState, type ReactNode } from "react";
import { RotateCcw, Undo2, UserPlus } from "lucide-react";
import {
  cubeColors,
  type AreaColor,
  type CardSummary,
  type CardUseMode,
  type CubeColor,
  type GameAction,
  type GameResponse,
  type PublicGameState,
} from "@sdb/protocol";
import { Board } from "./Board";
import { GameCard, PlayerStrip } from "./GameChrome";
import { deriveGameGuidance, type GameGuidance } from "./guidance";
import { SimulationViewer } from "./SimulationViewer";

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

const emptyCubeCounts = (): Record<CubeColor, number> => ({ red: 0, blue: 0, yellow: 0 });

const modeLabels: Record<CardUseMode, string> = {
  production: "生産",
  scoring: "得点",
  basic: "基本取得",
};

const GuidancePanel = ({
  guidance,
  children,
  compact = false,
}: {
  guidance: GameGuidance;
  children?: ReactNode;
  compact?: boolean;
}) => (
  <section className={`turn-guide ${compact ? "compact-guide" : ""} focus-${guidance.focus}`} aria-label="今やること">
    {compact ? (
      <>
        <strong>{guidance.title}</strong>
        <span>{guidance.required[0]}</span>
      </>
    ) : (
      <>
        <div className="guide-copy">
          <span className="guide-eyebrow">{guidance.eyebrow}</span>
          <h2>{guidance.title}</h2>
          <p>{guidance.detail}</p>
        </div>
        <div className="guide-cue">
          <span>{guidance.target}</span>
          <strong>{guidance.required[0]}</strong>
        </div>
        {Children.count(children) > 0 ? <div className="guide-controls">{children}</div> : null}
      </>
    )}
  </section>
);

export const App = () => {
  const [viewMode, setViewMode] = useState<"game" | "simulation">("game");
  const [state, setState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState<string>("");
  const [playerCount, setPlayerCount] = useState(2);
  const [names, setNames] = useState(["Player 1", "Player 2", "Player 3", "Player 4"]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [useMode, setUseMode] = useState<CardUseMode>("production");
  const [basicColor, setBasicColor] = useState<CubeColor>("red");
  const [endPlacementAreaId, setEndPlacementAreaId] = useState("");
  const [endPlacementColor, setEndPlacementColor] = useState<CubeColor>("red");
  const [secondPlacementAreaId, setSecondPlacementAreaId] = useState("");
  const [secondPlacementColor, setSecondPlacementColor] = useState<CubeColor>("blue");
  const [neutralDevelopmentAreaId, setNeutralDevelopmentAreaId] = useState("");
  const [neutralPlacementCount, setNeutralPlacementCount] = useState(0);
  const [neutralFirstColor, setNeutralFirstColor] = useState<CubeColor>("red");
  const [neutralSecondColor, setNeutralSecondColor] = useState<CubeColor>("blue");
  const [neutralBonusCubes, setNeutralBonusCubes] = useState<Record<CubeColor, number>>(emptyCubeCounts);
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
    setUseMode("production");
    setBasicColor("red");
    setEndPlacementAreaId("");
    setEndPlacementColor("red");
    setSecondPlacementAreaId("");
    setSecondPlacementColor("blue");
    setNeutralDevelopmentAreaId("");
    setNeutralPlacementCount(0);
    setNeutralFirstColor("red");
    setNeutralSecondColor("blue");
    setNeutralBonusCubes(emptyCubeCounts());
    setBuildIntersectionId("");
  }, [state?.currentPlayerId, state?.phase, state?.round]);

  const selectedCardForAction =
    currentPlayer?.handCards.find((card) => card.instanceId === selectedCardId) ??
    currentPlayer?.handCards[0] ??
    null;
  const availableUseModes: CardUseMode[] = selectedCardForAction?.color === "multi"
    ? ["production", "basic"]
    : ["production", "scoring", "basic"];

  useEffect(() => {
    if (selectedCardForAction?.color === "multi" && useMode === "scoring") {
      setUseMode("production");
    }
  }, [selectedCardForAction?.instanceId, selectedCardForAction?.color, useMode]);
  const endPlacementCapacity = state?.legal.turnEndAreaCapacity ?? 0;
  const placeableAreaIds = state?.legal.placeableAreaIds ?? [];
  const selectedBuildIntersection =
    state?.intersections.find((intersection) => intersection.id === buildIntersectionId) ?? null;
  const selectedBuildLevel =
    selectedBuildIntersection && selectedBuildIntersection.cityStack.length < 3
      ? selectedBuildIntersection.cityStack.length + 1
      : null;
  const turnEndProductionText = state?.turnEndProduction
    ? `追加生産見込み: ${colorLabels[state.turnEndProduction.color]} ${state.turnEndProduction.additionalCubes}`
    : "";
  const turnEndDevelopment = state?.turnEndDevelopment ?? null;
  const selectedNeutralDevelopmentArea =
    state?.areas.find((area) => area.id === neutralDevelopmentAreaId) ?? null;
  const neutralAdjacentCityPieces =
    state && selectedNeutralDevelopmentArea
      ? state.intersections
          .filter((intersection) => intersection.adjacentAreaIds.includes(selectedNeutralDevelopmentArea.id))
          .reduce((total, intersection) => total + intersection.cityStack.length, 0)
      : 0;
  const neutralBonusTotal = cubeColors.reduce((total, color) => total + neutralBonusCubes[color], 0);
  const tricolorSelectedAreaIds = [endPlacementAreaId, secondPlacementAreaId].filter(Boolean);
  const tricolorHasDuplicateArea =
    new Set(tricolorSelectedAreaIds).size !== tricolorSelectedAreaIds.length;
  const neutralRequiredCubes = emptyCubeCounts();
  if (neutralPlacementCount >= 1) neutralRequiredCubes[neutralFirstColor] += 1;
  if (neutralPlacementCount >= 2) neutralRequiredCubes[neutralSecondColor] += 1;
  const neutralCanPlace =
    !!neutralDevelopmentAreaId &&
    (neutralPlacementCount === 0 || placeableAreaIds.includes(neutralDevelopmentAreaId)) &&
    selectedNeutralDevelopmentArea !== null &&
    selectedNeutralDevelopmentArea.cubeTotal + neutralPlacementCount <= endPlacementCapacity &&
    cubeColors.every((color) => (currentPlayer?.cubes[color] ?? 0) >= neutralRequiredCubes[color]) &&
    neutralBonusTotal <= neutralAdjacentCityPieces;
  const worldLevelStatus = state
    ? `世界Lv${state.worldLevel} / 次の解禁: ${
        state.nextWorldLevelThreshold ? `${state.nextWorldLevelThreshold}点` : "なし"
      } / 現在最高: ${state.highestContribution}点`
    : "";
  const guidance = state
    ? deriveGameGuidance({
        state,
        selectedCard: selectedCardForAction,
        useMode,
        selectedAreaId: endPlacementAreaId,
        secondAreaId: secondPlacementAreaId,
        neutralAreaId: neutralDevelopmentAreaId,
        neutralPlacementCount,
        buildIntersectionId,
        hasError: Boolean(error),
      })
    : null;
  const latestHistory = state?.history[0] ?? null;
  const olderHistory = state?.history.slice(1) ?? [];
  const latestUnlock = state?.worldLevelUnlocks.at(-1) ?? null;

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

  const useCard = (card: CardSummary, mode: CardUseMode, color?: CubeColor) => {
    if (!state?.currentPlayerId) return;
    const action: Extract<GameAction, { type: "USE_CARD" }> = {
      type: "USE_CARD",
      playerId: state.currentPlayerId,
      cardInstanceId: card.instanceId,
      mode,
    };
    if (mode === "basic") action.basicColor = color ?? basicColor;
    void sendAction(action);
  };

  const useSelectedCard = (mode: CardUseMode, color?: CubeColor) => {
    if (!selectedCardForAction) return;
    setUseMode(mode);
    if (color) setBasicColor(color);
    useCard(selectedCardForAction, mode, color);
  };

  const buildCityAt = (intersectionId: string) => {
    if (!state?.currentPlayerId || !state.legal.buildableIntersectionIds.includes(intersectionId)) return;
    setBuildIntersectionId(intersectionId);
    void sendAction({
      type: "BUILD_CITY",
      playerId: state.currentPlayerId,
      intersectionId,
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

  const endTricolorTurn = () => {
    if (!state?.currentPlayerId) return;
    const placements = [
      endPlacementAreaId ? { areaId: endPlacementAreaId, color: endPlacementColor } : null,
      secondPlacementAreaId ? { areaId: secondPlacementAreaId, color: secondPlacementColor } : null,
    ].filter((placement): placement is { areaId: string; color: CubeColor } => placement !== null);
    void sendAction({
      type: "END_TURN",
      playerId: state.currentPlayerId,
      placements,
    });
  };

  const endNeutralDevelopmentTurn = () => {
    if (!state?.currentPlayerId || !neutralDevelopmentAreaId) return;
    const colors = [neutralFirstColor, neutralSecondColor].slice(0, neutralPlacementCount);
    void sendAction({
      type: "END_TURN",
      playerId: state.currentPlayerId,
      developmentAreaId: neutralDevelopmentAreaId,
      placements: colors.map((color) => ({ areaId: neutralDevelopmentAreaId, color })),
      bonusCubes: neutralAdjacentCityPieces > 0 ? neutralBonusCubes : undefined,
    });
  };

  const claimWorldLevelBonus = (color: CubeColor) => {
    if (!state?.currentPlayerId) return;
    void sendAction({
      type: "CLAIM_WORLD_LEVEL_BONUS",
      playerId: state.currentPlayerId,
      color,
    });
  };

  const currentPlayerHasCube = (color: CubeColor) => (currentPlayer?.cubes[color] ?? 0) > 0;

  const choosePlacementColor = (color: CubeColor) => {
    if (turnEndDevelopment?.type === "tricolor-city" && endPlacementAreaId) {
      setSecondPlacementColor(color);
      return;
    }
    setEndPlacementColor(color);
  };

  const selectDevelopmentArea = (areaId: string) => {
    if (!state?.currentPlayerId || state.phase !== "action" || !state.turnCardUsed || state.pendingWorldLevelBonus) return;

    if (turnEndDevelopment?.type === "neutral-development") {
      setNeutralDevelopmentAreaId(areaId);
      return;
    }

    if (!placeableAreaIds.includes(areaId)) return;

    if (turnEndDevelopment?.type === "tricolor-city") {
      if (!endPlacementAreaId || areaId === endPlacementAreaId) {
        setEndPlacementAreaId(areaId);
        return;
      }
      setSecondPlacementAreaId(areaId);
      return;
    }

    setEndPlacementAreaId(areaId);
    if (!currentPlayerHasCube(endPlacementColor)) return;
    void sendAction({
      type: "END_TURN",
      playerId: state.currentPlayerId,
      placement: {
        areaId,
        color: endPlacementColor,
      },
    });
  };

  const adjustNeutralBonus = (color: CubeColor, delta: number) => {
    updateNeutralBonus(color, neutralBonusCubes[color] + delta);
  };

  const updateNeutralBonus = (color: CubeColor, value: number) => {
    setNeutralBonusCubes((current) => ({
      ...current,
      [color]: Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0),
    }));
  };

  useEffect(() => {
    if (neutralAdjacentCityPieces > 0 || neutralBonusTotal === 0) return;
    setNeutralBonusCubes(emptyCubeCounts());
  }, [neutralAdjacentCityPieces, neutralBonusTotal]);

  if (viewMode === "simulation") {
    return <SimulationViewer onBackToGame={() => setViewMode("game")} />;
  }

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
          <button className="secondary" onClick={() => setViewMode("simulation")}>
            Simulation Viewer
          </button>
        </section>
      </main>
    );
  }

  const isResultScene = state.status === "ended" || state.phase === "ended";
  const isDraftScene = state.phase === "draft";
  const isPlayScene = state.phase === "action" && !isResultScene;
  const canShowCityBuild = state.phase === "action" && state.legal.canBuildCity && state.legal.buildableIntersectionIds.length > 0;
  const drawerHistory = isPlayScene ? state.history : olderHistory;
  const boardAreaSelection =
    turnEndDevelopment?.type === "neutral-development" ? neutralDevelopmentAreaId : endPlacementAreaId;
  const boardPlaceableAreaIds =
    turnEndDevelopment?.type === "neutral-development"
      ? state.areas.map((area) => area.id)
      : placeableAreaIds;
  const latestEvent = (
    <section className="history latest-history" aria-label="最新イベント">
      <h2>最新イベント</h2>
      {latestHistory ? (
        <article>
          <strong>R{latestHistory.round} {latestHistory.playerName}</strong>
          <span>{latestHistory.summary}</span>
        </article>
      ) : latestUnlock ? (
        <article>
          <strong>{latestUnlock.playerName}</strong>
          <span>世界Lv{latestUnlock.level}を解禁しました</span>
          {latestUnlock.bonusColor ? <span>ボーナス: {colorLabels[latestUnlock.bonusColor]}</span> : null}
        </article>
      ) : <p>なし</p>}
    </section>
  );
  const historyDrawer = (
    <details className="history history-drawer">
      <summary>行動履歴を開く</summary>
      {drawerHistory.length === 0 ? <p>なし</p> : null}
      {drawerHistory.map((entry) => (
        <article key={entry.id}>
          <strong>R{entry.round} {entry.playerName}</strong>
          <span>{entry.summary}</span>
        </article>
      ))}
    </details>
  );
  const latestEventToast = latestHistory ? (
    <aside className="latest-toast" aria-label="最新イベント">
      <strong>R{latestHistory.round} {latestHistory.playerName}</strong>
      <span>{latestHistory.summary}</span>
    </aside>
  ) : latestUnlock ? (
    <aside className="latest-toast" aria-label="最新イベント">
      <strong>{latestUnlock.playerName}</strong>
      <span>世界Lv{latestUnlock.level} 解禁</span>
    </aside>
  ) : null;
  const playHud = isPlayScene ? (
    <header className="play-hud" aria-label="ゲーム情報">
      <div className="hud-turn">
        <strong>{state.currentPlayerName ?? "終了"}</strong>
        <span>Round {state.round}/{state.maxRounds} · WORLD Lv{state.worldLevel}</span>
      </div>
      <div className="hud-player-row" aria-label="プレイヤー">
        {state.players.map((player) => (
          <article
            key={player.id}
            className={`hud-player ${player.id === state.currentPlayerId ? "active" : ""}`}
            style={{ borderColor: player.color }}
          >
            <strong>{player.name}</strong>
            <span>貢献 {player.contribution}</span>
            <span>都市 {player.cityCount}</span>
            <span className="hud-cubes">
              R{player.cubes.red} B{player.cubes.blue} Y{player.cubes.yellow}
            </span>
          </article>
        ))}
      </div>
      <div className="icon-actions hud-tools">
        <button aria-label="Simulation Viewer" onClick={() => setViewMode("simulation")}>
          Sim
        </button>
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
  ) : null;
  const board = (
    <Board
      state={state}
      selectedAreaId={boardAreaSelection}
      selectedIntersectionId={buildIntersectionId}
      placeableAreaIds={boardPlaceableAreaIds}
      buildableIntersectionIds={state.legal.buildableIntersectionIds}
      onAreaSelect={selectDevelopmentArea}
      onIntersectionSelect={buildCityAt}
    />
  );
  const guidanceControls = guidance ? <GuidancePanel guidance={guidance} compact={isPlayScene} /> : null;
  const draftCards = isDraftScene ? (
    <aside className="card-panel draft-table" aria-label="カード選択">
      <section className="actions card-actions">
        <h2>ドラフト {state.draftPickNumber} / 8</h2>
        <div className="card-list draft-card-list">
          {state.legal.draftPack.map((card) => (
            <GameCard key={card.instanceId} card={card} onSelect={draftPick} />
          ))}
        </div>
      </section>
    </aside>
  ) : null;
  const handCards = state.phase === "action" ? (
    <aside className="card-panel hand-rail" aria-label="カード選択">
      <section className="actions card-actions">
        <div className="rail-heading">
          <h2>手札</h2>
          {selectedCardForAction && !state.turnCardUsed ? <span>{selectedCardForAction.name}</span> : null}
        </div>
        {state.turnCardUsed ? (
          <p className="hint">
            {state.pendingWorldLevelBonus
              ? "解禁ボーナスを選んでください。"
              : "盤面で配置先を選ぶか、手番を終了します。"}
          </p>
        ) : null}
        <div className="card-list hand-card-list" aria-label="手札">
          {currentPlayer?.handCards.map((card) => (
            <GameCard
              key={card.instanceId}
              card={card}
              density="compact"
              selected={card.instanceId === selectedCardForAction?.instanceId}
              disabled={state.turnCardUsed}
              onSelect={(nextCard) => setSelectedCardId(nextCard.instanceId)}
            />
          ))}
        </div>
        {!state.turnCardUsed && selectedCardForAction ? (
          <div className="card-use-strip" aria-label={`${selectedCardForAction.name}の使い方`}>
            <div className={`selected-action-card card-${selectedCardForAction.color}`}>
              <strong>{selectedCardForAction.name}</strong>
              <details className="selected-card-details">
                <summary>詳細</summary>
                <p><span>行動</span>{selectedCardForAction.actionText}</p>
                {selectedCardForAction.color !== "multi" ? <p><span>得点</span>{selectedCardForAction.scoringText}</p> : null}
              </details>
            </div>
            <div className="selected-card-actions">
              {availableUseModes.map((candidate) => candidate === "basic" ? (
                <div key={candidate} className="basic-use-group" aria-label="基本取得">
                  {cubeColors.map((color) => (
                    <button
                      key={color}
                      className={`cube-choice ${color}`}
                      onClick={() => useSelectedCard("basic", color)}
                      disabled={!state.legal.canUseCard}
                    >
                      基本取得 {colorLabels[color]}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  key={candidate}
                  className={candidate === "production" ? "primary" : "secondary"}
                  onClick={() => useSelectedCard(candidate)}
                  disabled={!state.legal.canUseCard}
                >
                  {candidate === "production"
                    ? selectedCardForAction.color === "multi" ? "行動" : "生産"
                    : modeLabels[candidate]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </aside>
  ) : null;
  const hasContextActions =
    state.phase === "action" &&
    (Boolean(state.pendingWorldLevelBonus) || canShowCityBuild || (state.turnCardUsed && !state.pendingWorldLevelBonus));
  const contextActions = hasContextActions ? (
    <section className="context-action-strip" aria-label="都市建設・エリア開発">
      {state.pendingWorldLevelBonus ? (
        <section className="action-cluster world-bonus">
          <h2>世界Lvボーナス</h2>
          <div className="cube-button-row" aria-label="解禁ボーナス">
            {cubeColors.map((color) => (
              <button
                key={color}
                className={`cube-choice ${color}`}
                onClick={() => claimWorldLevelBonus(color)}
                disabled={!state.legal.canClaimWorldLevelBonus}
              >
                {colorLabels[color]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {canShowCityBuild ? (
      <section className="action-cluster city-build-actions">
        <h2>都市建設</h2>
        <p className="direct-hint">
          光る交点をクリック
        </p>
        <p className="hint">
          コスト {selectedBuildLevel ? `各${selectedBuildLevel}` : "交点Lv分"}
        </p>
      </section>
      ) : null}

      {state.turnCardUsed && !state.pendingWorldLevelBonus && !turnEndDevelopment ? (
        <section className="action-cluster development-actions">
          <h2>ターン終了時配置</h2>
          {turnEndProductionText ? <p className="hint">{turnEndProductionText}</p> : null}
          <div className="cube-button-row" aria-label="配置色">
            {cubeColors.map((color) => (
              <button
                key={color}
                className={`cube-choice ${color} ${endPlacementColor === color ? "selected" : ""}`}
                onClick={() => choosePlacementColor(color)}
                disabled={(currentPlayer?.cubes[color] ?? 0) < 1}
              >
                {colorLabels[color]} {currentPlayer?.cubes[color] ?? 0}
              </button>
            ))}
          </div>
          <button className="secondary wide" onClick={() => endTurn(false)} disabled={!state.legal.canEndTurn}>
            置かずに手番終了
          </button>
        </section>
      ) : null}

      {state.turnCardUsed && !state.pendingWorldLevelBonus && turnEndDevelopment?.type === "tricolor-city" ? (
        <section className="action-cluster development-actions">
          <h2>三色都市の開発</h2>
          <div className="cube-button-row" aria-label="次の配置色">
            {cubeColors.map((color) => (
              <button
                key={color}
                className={`cube-choice ${color} ${(endPlacementAreaId ? secondPlacementColor : endPlacementColor) === color ? "selected" : ""}`}
                onClick={() => choosePlacementColor(color)}
                disabled={(currentPlayer?.cubes[color] ?? 0) < 1}
              >
                {colorLabels[color]} {currentPlayer?.cubes[color] ?? 0}
              </button>
            ))}
          </div>
          <div className="selection-summary" aria-label="三色都市の配置選択">
            <span>1個目: {endPlacementAreaId || "未選択"} / {colorLabels[endPlacementColor]}</span>
            <span>2個目: {secondPlacementAreaId || "未選択"} / {colorLabels[secondPlacementColor]}</span>
          </div>
          <button className="primary wide" onClick={endTricolorTurn} disabled={!state.legal.canEndTurn || tricolorHasDuplicateArea}>
            選択分を置いて手番終了
          </button>
          <button
            className="secondary wide"
            onClick={() => {
              if (!state.currentPlayerId) return;
              void sendAction({
                type: "END_TURN",
                playerId: state.currentPlayerId,
                placements: [],
              });
            }}
            disabled={!state.legal.canEndTurn}
          >
            すべてスキップして手番終了
          </button>
        </section>
      ) : null}

      {state.turnCardUsed && !state.pendingWorldLevelBonus && turnEndDevelopment?.type === "neutral-development" ? (
        <section className="action-cluster development-actions neutral-actions">
          <h2>中立開発</h2>
          <div className="selection-summary" aria-label="中立開発の対象">
            <span>対象: {neutralDevelopmentAreaId || "未選択"}</span>
            <span>現在色: {selectedNeutralDevelopmentArea ? areaColorLabels[selectedNeutralDevelopmentArea.areaColor] : "未選択"}</span>
            <span>任意色取得上限: {neutralAdjacentCityPieces}個</span>
          </div>
          <div className="mini-action-row" aria-label="配置数">
            {[0, 1, 2].map((count) => (
              <button
                key={count}
                className={neutralPlacementCount === count ? "selected" : ""}
                onClick={() => setNeutralPlacementCount(count)}
              >
                {count}個配置
              </button>
            ))}
          </div>
          {neutralPlacementCount >= 1 ? (
            <div className="cube-button-row" aria-label="中立開発 1個目 色">
              {cubeColors.map((color) => (
                <button
                  key={color}
                  className={`cube-choice ${color} ${neutralFirstColor === color ? "selected" : ""}`}
                  onClick={() => setNeutralFirstColor(color)}
                  disabled={(currentPlayer?.cubes[color] ?? 0) < 1}
                >
                  1個目 {colorLabels[color]}
                </button>
              ))}
            </div>
          ) : null}
          {neutralPlacementCount >= 2 ? (
            <div className="cube-button-row" aria-label="中立開発 2個目 色">
              {cubeColors.map((color) => (
                <button
                  key={color}
                  className={`cube-choice ${color} ${neutralSecondColor === color ? "selected" : ""}`}
                  onClick={() => setNeutralSecondColor(color)}
                  disabled={(currentPlayer?.cubes[color] ?? 0) < 1}
                >
                  2個目 {colorLabels[color]}
                </button>
              ))}
            </div>
          ) : null}
          {neutralAdjacentCityPieces > 0 ? (
            <div className="bonus-stepper-grid" aria-label="中立ボーナス">
              {cubeColors.map((color) => (
                <div key={color} className="bonus-stepper">
                  <span>{colorLabels[color]}取得 {neutralBonusCubes[color]}</span>
                  <button
                    aria-label={`${colorLabels[color]}取得を減らす`}
                    onClick={() => adjustNeutralBonus(color, -1)}
                    disabled={neutralBonusCubes[color] <= 0}
                  >
                    -
                  </button>
                  <button
                    aria-label={`${colorLabels[color]}取得を増やす`}
                    onClick={() => adjustNeutralBonus(color, 1)}
                    disabled={neutralBonusTotal >= neutralAdjacentCityPieces}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <button className="primary wide" onClick={endNeutralDevelopmentTurn} disabled={!state.legal.canEndTurn || !neutralCanPlace}>
            中立開発を解決して手番終了
          </button>
        </section>
      ) : null}
    </section>
  ) : null;

  return (
    <main className={`app-shell ${isPlayScene ? "play-shell" : ""} focus-${guidance?.focus ?? "setup"}`}>
      {!isPlayScene ? (
        <>
          <header className="topbar">
            <div>
              <h1>Hex Cube Cities</h1>
              <p>
                Round {state.round} / {state.maxRounds} · {state.phase === "draft" ? "ドラフト" : state.phase === "action" ? "アクション" : "終了"} · 世界Lv {state.worldLevel} ·
                最大都市Lv {state.cityLevel} · 容量 {state.areaCapacity} · 盤面 {state.boardCubeTotal}
              </p>
              <p>{worldLevelStatus}</p>
            </div>
            <div className="turn-block">
              <span>手番</span>
              <strong>{state.currentPlayerName ?? "終了"}</strong>
            </div>
            <div className="icon-actions">
              <button aria-label="Simulation Viewer" onClick={() => setViewMode("simulation")}>
                Sim
              </button>
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

          <PlayerStrip players={state.players} currentPlayerId={state.currentPlayerId} />
        </>
      ) : null}

      {error ? <p className="error scene-error">{error}</p> : null}

      {isResultScene ? (
        <section className="game-scene result-scene">
          {guidanceControls}
          <section className="results">
            <h2>結果</h2>
            <p>勝者: {state.winners.map((winner) => winner.name).join(", ")}</p>
            {state.players.map((player) => (
              <p key={player.id}>
                {player.name}: 貢献 {player.contribution} + 都市 {player.cityCount} = {player.finalScore}
              </p>
            ))}
          </section>
          <aside className="right-panel table-log">
            {latestEvent}
            {historyDrawer}
          </aside>
        </section>
      ) : isDraftScene ? (
        <section className="game-scene draft-scene">
          {guidanceControls}
          {draftCards}
          <aside className="right-panel table-log">
            {latestEvent}
            {historyDrawer}
          </aside>
        </section>
      ) : (
        <section className="game-scene board-scene">
          {playHud}
          {board}
          <div className="board-hud">
            {guidanceControls}
          </div>
          {contextActions}
          {handCards}
          <aside className="play-history-tray">
            {latestEventToast}
            {historyDrawer}
          </aside>
        </section>
      )}
    </main>
  );
};
