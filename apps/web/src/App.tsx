import { useEffect, useState, type ReactNode } from "react";
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
}: {
  guidance: GameGuidance;
  children?: ReactNode;
}) => (
  <section className={`turn-guide focus-${guidance.focus}`} aria-label="今やること">
    <div className="guide-copy">
      <span className="guide-eyebrow">{guidance.eyebrow}</span>
      <h2>{guidance.title}</h2>
      <p>{guidance.detail}</p>
    </div>
    <div className="guide-target">
      <span>操作対象</span>
      <strong>{guidance.target}</strong>
    </div>
    <div className="guide-steps" aria-label="必要な操作">
      <strong>必須</strong>
      {guidance.required.map((item) => <span key={item}>{item}</span>)}
    </div>
    {guidance.optional.length > 0 ? (
      <div className="guide-steps optional" aria-label="任意操作">
        <strong>任意</strong>
        {guidance.optional.map((item) => <span key={item}>{item}</span>)}
      </div>
    ) : null}
    {children ? <div className="guide-controls">{children}</div> : null}
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

  const selectedCardForAction = currentPlayer?.handCards.find((card) => card.instanceId === selectedCardId) ?? null;
  const availableUseModes: CardUseMode[] = selectedCardForAction?.color === "multi"
    ? ["production", "basic"]
    : ["production", "scoring", "basic"];

  useEffect(() => {
    if (selectedCardForAction?.color === "multi" && useMode === "scoring") {
      setUseMode("production");
    }
  }, [selectedCardForAction?.instanceId, selectedCardForAction?.color, useMode]);
  const endPlacementCapacity = state?.legal.turnEndAreaCapacity ?? 0;
  const selectedEndPlacementArea =
    state?.areas.find((area) => area.id === endPlacementAreaId) ?? null;
  const placeableAreaIds = state?.legal.placeableAreaIds ?? [];
  const canPlaceSelectedArea =
    !!selectedEndPlacementArea && placeableAreaIds.includes(selectedEndPlacementArea.id);
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
  const tricolorRequiredCubes = emptyCubeCounts();
  if (endPlacementAreaId) tricolorRequiredCubes[endPlacementColor] += 1;
  if (secondPlacementAreaId) tricolorRequiredCubes[secondPlacementColor] += 1;
  const tricolorCanPlace =
    !tricolorHasDuplicateArea &&
    (!endPlacementAreaId || placeableAreaIds.includes(endPlacementAreaId)) &&
    (!secondPlacementAreaId || placeableAreaIds.includes(secondPlacementAreaId)) &&
    cubeColors.every((color) => (currentPlayer?.cubes[color] ?? 0) >= tricolorRequiredCubes[color]);
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

  return (
    <main className={`app-shell focus-${guidance?.focus ?? "setup"}`}>
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

      <section className="workspace">
        {guidance ? (
          <GuidancePanel guidance={guidance}>
            {state.phase === "action" && state.pendingWorldLevelBonus ? (
              <div className="bonus-buttons guided-choice" aria-label="解禁ボーナス">
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
            ) : null}

            {state.phase === "action" && !state.turnCardUsed ? (
              <>
                {selectedCardForAction ? (
                  <article className={`selected-action-card card-${selectedCardForAction.color}`}>
                    <strong>{selectedCardForAction.name}</strong>
                    <p>{useMode === "scoring" ? selectedCardForAction.scoringText : selectedCardForAction.actionText}</p>
                  </article>
                ) : null}
                <div className="mode-tabs guided-modes" role="tablist" aria-label="カード用途">
                  {availableUseModes.map((candidate) => (
                    <button
                      key={candidate}
                      className={useMode === candidate ? "selected" : ""}
                      onClick={() => setUseMode(candidate)}
                      disabled={state.turnCardUsed || !selectedCardForAction}
                    >
                      {candidate === "production"
                        ? selectedCardForAction?.color === "multi" ? "行動" : "生産"
                        : modeLabels[candidate]}
                    </button>
                  ))}
                </div>

                {useMode === "basic" ? (
                  <label className="guided-field">
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

                <button className="primary guide-primary" onClick={confirmUseCard} disabled={!state.legal.canUseCard || !selectedCardForAction}>
                  カードを使用
                </button>
              </>
            ) : null}
          </GuidancePanel>
        ) : null}

        <aside className="card-panel" aria-label="カード選択">
          {state.phase === "draft" ? (
            <section className="actions card-actions">
              <h2>ドラフト {state.draftPickNumber} / 8</h2>
              <div className="card-list">
                {state.legal.draftPack.map((card) => (
                  <GameCard key={card.instanceId} card={card} onSelect={draftPick} />
                ))}
              </div>
            </section>
          ) : null}

          {state.phase === "action" ? (
            <section className="actions card-actions">
              <h2>カード選択</h2>
              {state.turnCardUsed ? (
                <p className="hint">
                  {state.pendingWorldLevelBonus
                    ? "カード使用済み。解禁ボーナス選択後に手番を続けられます。"
                    : "カード使用済み。都市建設後に手番終了できます。"}
                </p>
              ) : null}
              <div className="card-list hand-card-list" aria-label="手札">
                {currentPlayer?.handCards.map((card) => (
                  <GameCard
                    key={card.instanceId}
                    card={card}
                    density="compact"
                    selected={card.instanceId === selectedCardId}
                    disabled={state.turnCardUsed}
                    onSelect={(nextCard) => setSelectedCardId(nextCard.instanceId)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <aside className="operations-panel" aria-label="都市建設・エリア開発">
          {state.phase === "action" ? (
            <section className="actions city-build-actions">
              <h2>都市建設</h2>
              <label>
                交点
                <select value={buildIntersectionId} onChange={(event) => setBuildIntersectionId(event.target.value)}>
                  <option value="">選択</option>
                  {state.intersections
                    .map((intersection) => (
                      <option
                        key={intersection.id}
                        value={intersection.id}
                        disabled={!state.legal.buildableIntersectionIds.includes(intersection.id)}
                      >
                        {intersection.id} Lv{Math.min(intersection.cityStack.length + 1, 3)}
                        {intersection.cityStack.length > 0 ? ` (${intersection.cityStack.map((city) => `Lv${city.level}`).join("/")})` : ""}
                      </option>
                    ))}
                </select>
              </label>
              <p className="hint">
                コスト: {selectedBuildLevel ? `赤${selectedBuildLevel} 青${selectedBuildLevel} 黄${selectedBuildLevel}` : "交点を選択"}。カードは消費しません。
              </p>
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

          {state.phase === "action" && state.turnCardUsed && !state.pendingWorldLevelBonus && !turnEndDevelopment ? (
            <section className="actions development-actions">
              <h2>ターン終了時配置</h2>
              {turnEndProductionText ? <p className="hint">{turnEndProductionText}</p> : null}
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

          {state.phase === "action" && state.turnCardUsed && !state.pendingWorldLevelBonus && turnEndDevelopment?.type === "tricolor-city" ? (
            <section className="actions development-actions">
              <h2>三色都市の開発</h2>
              <p className="hint">異なる2エリアへ最大1個ずつ配置できます。開発後、条件を満たせば赤青黄を1個ずつ得ます。</p>
              <div className="payment-grid">
                <label>
                  1個目 色
                  <select value={endPlacementColor} onChange={(event) => setEndPlacementColor(event.target.value as CubeColor)}>
                    {cubeColors.map((color) => (
                      <option key={color} value={color}>
                        {colorLabels[color]} {currentPlayer?.cubes[color] ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  1個目 エリア
                  <select value={endPlacementAreaId} onChange={(event) => setEndPlacementAreaId(event.target.value)}>
                    <option value="">スキップ</option>
                    {state.areas.map((area) => (
                      <option key={area.id} value={area.id} disabled={!placeableAreaIds.includes(area.id)}>
                        {area.label} {area.cubeTotal}/{endPlacementCapacity}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  2個目 色
                  <select value={secondPlacementColor} onChange={(event) => setSecondPlacementColor(event.target.value as CubeColor)}>
                    {cubeColors.map((color) => (
                      <option key={color} value={color}>
                        {colorLabels[color]} {currentPlayer?.cubes[color] ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  2個目 エリア
                  <select value={secondPlacementAreaId} onChange={(event) => setSecondPlacementAreaId(event.target.value)}>
                    <option value="">スキップ</option>
                    {state.areas.map((area) => (
                      <option
                        key={area.id}
                        value={area.id}
                        disabled={!placeableAreaIds.includes(area.id) || area.id === endPlacementAreaId}
                      >
                        {area.label} {area.cubeTotal}/{endPlacementCapacity}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="primary wide" onClick={endTricolorTurn} disabled={!state.legal.canEndTurn || !tricolorCanPlace}>
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

          {state.phase === "action" && state.turnCardUsed && !state.pendingWorldLevelBonus && turnEndDevelopment?.type === "neutral-development" ? (
            <section className="actions development-actions">
              <h2>中立開発</h2>
              <p className="hint">対象エリア1つへ最大2個配置できます。開発後に中立なら隣接都市数だけ任意色を得ます。</p>
              <label>
                対象エリア
                <select value={neutralDevelopmentAreaId} onChange={(event) => setNeutralDevelopmentAreaId(event.target.value)}>
                  <option value="">選択</option>
                  {state.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.label} {area.cubeTotal}/{endPlacementCapacity}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                配置数
                <select value={neutralPlacementCount} onChange={(event) => setNeutralPlacementCount(Number(event.target.value))}>
                  {[0, 1, 2].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              {neutralPlacementCount >= 1 ? (
                <label>
                  1個目 色
                  <select value={neutralFirstColor} onChange={(event) => setNeutralFirstColor(event.target.value as CubeColor)}>
                    {cubeColors.map((color) => (
                      <option key={color} value={color}>
                        {colorLabels[color]} {currentPlayer?.cubes[color] ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {neutralPlacementCount >= 2 ? (
                <label>
                  2個目 色
                  <select value={neutralSecondColor} onChange={(event) => setNeutralSecondColor(event.target.value as CubeColor)}>
                    {cubeColors.map((color) => (
                      <option key={color} value={color}>
                        {colorLabels[color]} {currentPlayer?.cubes[color] ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p className="hint">
                現在色: {selectedNeutralDevelopmentArea ? areaColorLabels[selectedNeutralDevelopmentArea.areaColor] : "未選択"} /
                中立で解決される場合の任意色取得上限 {neutralAdjacentCityPieces}個
              </p>
              {neutralAdjacentCityPieces > 0 ? (
                <div className="payment-grid">
                  {cubeColors.map((color) => (
                    <label key={color}>
                      {colorLabels[color]}取得
                      <input
                        type="number"
                        min="0"
                        max={neutralAdjacentCityPieces}
                        value={neutralBonusCubes[color]}
                        onChange={(event) => updateNeutralBonus(color, Number(event.target.value))}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              <button className="primary wide" onClick={endNeutralDevelopmentTurn} disabled={!state.legal.canEndTurn || !neutralCanPlace}>
                中立開発を解決して手番終了
              </button>
            </section>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
        </aside>

        <Board
          state={state}
          selectedAreaId={turnEndDevelopment?.type === "neutral-development" ? neutralDevelopmentAreaId : endPlacementAreaId}
          selectedIntersectionId={buildIntersectionId}
          placeableAreaIds={
            turnEndDevelopment?.type === "neutral-development"
              ? state.areas.map((area) => area.id)
              : placeableAreaIds
          }
          buildableIntersectionIds={state.legal.buildableIntersectionIds}
          onAreaSelect={
            turnEndDevelopment?.type === "neutral-development"
              ? setNeutralDevelopmentAreaId
              : setEndPlacementAreaId
          }
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
          <details className="history history-drawer">
            <summary>行動履歴を開く</summary>
            {olderHistory.length === 0 ? <p>なし</p> : null}
            {olderHistory.map((entry) => (
              <article key={entry.id}>
                <strong>R{entry.round} {entry.playerName}</strong>
                <span>{entry.summary}</span>
              </article>
            ))}
          </details>
        </aside>
      </section>
    </main>
  );
};
