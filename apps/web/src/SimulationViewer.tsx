import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronsLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { cubeColors, type AreaColor, type CardType, type CardUseMode, type CubeColor } from "@sdb/protocol";
import { type GameRecord, type ReplayStep, type SimulationMetadata, type SimulationSummary } from "@sdb/simulation";
import { Board } from "./Board";

type RunListItem = {
  runId: string;
  createdAt: string;
  gameCount: number;
  completedGames: number;
  failedGames: number;
  playerCount: number;
  runSeed: string;
  agents: SimulationMetadata["agents"];
  schemaVersion: string;
};

type ScoreStats = {
  averageFinalScore: number;
  medianFinalScore: number;
  scoreDistribution: { bucket: string; count: number }[];
  averageFirstLastScoreGap: number;
  winRateByPlayerIndex: Record<string, number>;
  averageRankByPlayerIndex: Record<string, number>;
};

type LevelStats = {
  level: 2 | 3;
  reachRate: number;
  averageReachRound: number | null;
  averageReachStep: number | null;
  timingDistribution: { round: number; count: number }[];
  unlockPlayerIndexDistribution: Record<string, number>;
};

type CardStats = {
  type: CardType;
  draftCount: number;
  useCount: number;
  actionUseCount: number;
  scoringUseCount: number;
  basicUseCount: number;
  modeRatios: Record<CardUseMode, number>;
  drafterAverageFinalScore: number | null;
  drafterAverageRank: number | null;
  drafterWinRate: number | null;
  tricolorBonusCount?: number;
  tricolorBonusRate?: number | null;
  neutralDevelopmentBonusCount?: number;
  neutralDevelopmentAverageBonusCubes?: number | null;
  neutralDevelopmentMaxBonusCubes?: number;
};

type GameListItem = {
  gameId: string;
  gameSeed: string;
  status: GameRecord["status"];
  finalScores: { playerId: string; score: number; rank: number }[];
  winners: string[];
  level2Timing: { round: number; step: number; playerId: string } | null;
  level3Timing: { round: number; step: number; playerId: string } | null;
  finalWorldLevel: 1 | 2 | 3 | null;
  scoreGap: number | null;
  tags: string[];
};

type RunDetails = {
  metadata: SimulationMetadata;
  summary: SimulationSummary;
  analysis: {
    score: ScoreStats;
    levels: { level2: LevelStats; level3: LevelStats };
    cards: CardStats[];
    cities: {
      averageCityPiecesPerGame: number;
      averageBuildsByLevel: Record<1 | 2 | 3, number>;
      emptyIntersectionBuilds: number;
      stackedCityBuilds: number;
      stackingRate: number;
      winnerAverageCityCount: number | null;
      winnerAverageCitiesByLevel: Record<1 | 2 | 3, number>;
    };
    areas: {
      finalAverageAreaCounts: Record<AreaColor, number>;
      roundEndColorDistribution: { round: number; colors: Record<AreaColor, number> }[];
      roundEndAreaLevelDistribution: { round: number; levels: Record<0 | 1 | 2 | 3, number> }[];
      neutralAreaTrend: { round: number; averageNeutralAreas: number }[];
      colorChangeCount: number | null;
      neutralizationCount: number | null;
    };
  };
  games: GameListItem[];
};

const cardLabels: Record<CardType, string> = {
  "red-production": "赤の生産",
  "blue-production": "青の生産",
  "yellow-production": "黄の生産",
  "tricolor-city": "三色都市",
  "neutral-development": "中立開発",
};

const modeLabels: Record<CardUseMode, string> = {
  production: "行動/生産",
  scoring: "得点",
  basic: "基本取得",
};

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

const apiJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "simulationデータの読み込みに失敗しました。");
  return data;
};

const numberText = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" ? value.toFixed(digits) : "なし";

const percentText = (value: number | null | undefined) =>
  typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "なし";

const agentsText = (agents: SimulationMetadata["agents"]) =>
  Object.entries(agents).map(([playerId, agent]) => `${playerId}: ${agent.name}`).join(" / ");

const timingText = (timing: GameListItem["level2Timing"]) =>
  timing ? `R${timing.round} step ${timing.step} ${timing.playerId}` : "未到達";

const tagLabel = (tag: string) =>
  tag === "large-gap" ? "大差" : tag === "close" ? "接戦" : tag === "no-lv3" ? "Lv3未到達" : tag === "early-lv3" ? "Lv3早期" : tag;

const JsonValue = ({ value }: { value: unknown }) => (
  <code>{JSON.stringify(value)}</code>
);

const MetricGrid = ({ children }: { children: ReactNode }) => (
  <div className="metric-grid">{children}</div>
);

const Metric = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="metric">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const Histogram = ({ rows }: { rows: { bucket: string; count: number }[] }) => {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="histogram" aria-label="最終得点分布">
      {rows.map((row) => (
        <div key={row.bucket} className="histogram-row">
          <span>{row.bucket}</span>
          <div>
            <i style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
};

const LevelPanel = ({ stats }: { stats: LevelStats }) => (
  <section className="viewer-section">
    <h3>世界Lv{stats.level}</h3>
    <MetricGrid>
      <Metric label="到達率" value={percentText(stats.reachRate)} />
      <Metric label="平均到達ラウンド" value={numberText(stats.averageReachRound)} />
      <Metric label="平均到達step" value={numberText(stats.averageReachStep)} />
    </MetricGrid>
    <div className="split-grid">
      <table>
        <caption>到達タイミング分布</caption>
        <thead><tr><th>round</th><th>games</th></tr></thead>
        <tbody>
          {stats.timingDistribution.map((row) => (
            <tr key={row.round}><td>{row.round}</td><td>{row.count}</td></tr>
          ))}
        </tbody>
      </table>
      <table>
        <caption>解禁者player index分布</caption>
        <thead><tr><th>player</th><th>count</th></tr></thead>
        <tbody>
          {Object.entries(stats.unlockPlayerIndexDistribution).map(([playerId, count]) => (
            <tr key={playerId}><td>{playerId}</td><td>{count}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const EventDetails = ({ step }: { step: ReplayStep }) => {
  const action = step.action;
  const placements = action?.type === "END_TURN"
    ? [action.placement, ...(action.placements ?? [])].filter(Boolean)
    : [];
  return (
    <section className="viewer-section" aria-label="Replay step情報">
      <h3>Step情報</h3>
      <MetricGrid>
        <Metric label="round" value={step.round} />
        <Metric label="phase" value={step.snapshot.phase} />
        <Metric label="acting player" value={step.playerId ?? "system"} />
        <Metric label="event type" value={step.eventType} />
      </MetricGrid>
      <dl className="event-list">
        <dt>使用カード</dt>
        <dd>{typeof step.details.cardType === "string" ? cardLabels[step.details.cardType as CardType] ?? step.details.cardType : "なし"}</dd>
        <dt>カード用途</dt>
        <dd>{action?.type === "USE_CARD" ? modeLabels[action.mode] : typeof step.details.mode === "string" ? step.details.mode : "なし"}</dd>
        <dt>都市建設</dt>
        <dd>{action?.type === "BUILD_CITY" ? `${action.intersectionId} / Lv${numberFromDetails(step.details, "level") ?? "?"}` : "なし"}</dd>
        <dt>キューブ配置</dt>
        <dd>{placements.length > 0 ? placements.map((placement) => `${placement?.areaId}:${placement?.color}`).join(" / ") : "なし"}</dd>
        <dt>得点変化</dt>
        <dd>{step.eventType === "score_gain" ? `${String(step.details.playerId)} +${String(step.details.amount)}` : "なし"}</dd>
        <dt>世界Lv変化</dt>
        <dd>{step.eventType === "world_level_unlock" ? `Lv${String(step.details.level)} ${String(step.details.playerId)}` : "なし"}</dd>
        <dt>特殊効果</dt>
        <dd>{typeof step.details.developmentType === "string" ? step.details.developmentType : "なし"}</dd>
        <dt>都市生産</dt>
        <dd>{step.eventType === "city_production" ? <JsonValue value={step.details.production} /> : "なし"}</dd>
      </dl>
      <details>
        <summary>保存details</summary>
        <pre>{JSON.stringify(step.details, null, 2)}</pre>
      </details>
    </section>
  );
};

const numberFromDetails = (details: Record<string, unknown>, key: string) =>
  typeof details[key] === "number" ? details[key] : null;

export const SimulationViewer = ({ onBackToGame }: { onBackToGame: () => void }) => {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("gap-desc");
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson<{ runs: RunListItem[] }>("/api/simulations/runs")
      .then((data) => {
        setRuns(data.runs);
        setError("");
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, []);

  const loadRun = async (runId: string) => {
    try {
      setSelectedRunId(runId);
      setSelectedGameId("");
      setSelectedGame(null);
      setStepIndex(0);
      const nextDetails = await apiJson<RunDetails>(`/api/simulations/runs/${encodeURIComponent(runId)}`);
      setDetails(nextDetails);
      setError("");
    } catch (loadError) {
      setDetails(null);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  };

  const loadGame = async (gameId: string) => {
    if (!selectedRunId) return;
    try {
      const game = await apiJson<GameRecord>(`/api/simulations/runs/${encodeURIComponent(selectedRunId)}/games/${encodeURIComponent(gameId)}`);
      setSelectedGameId(gameId);
      setSelectedGame(game);
      setStepIndex(0);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  };

  const filteredGames = useMemo(() => {
    const games = [...(details?.games ?? [])].filter((game) => filter === "all" || game.tags.includes(filter));
    games.sort((first, second) => {
      if (sort === "gap-asc") return (first.scoreGap ?? Number.MAX_SAFE_INTEGER) - (second.scoreGap ?? Number.MAX_SAFE_INTEGER);
      if (sort === "seed") return first.gameSeed.localeCompare(second.gameSeed);
      if (sort === "winner") return (first.winners[0] ?? "").localeCompare(second.winners[0] ?? "");
      if (sort === "lv3") return (first.level3Timing?.step ?? Number.MAX_SAFE_INTEGER) - (second.level3Timing?.step ?? Number.MAX_SAFE_INTEGER);
      return (second.scoreGap ?? -1) - (first.scoreGap ?? -1);
    });
    return games;
  }, [details?.games, filter, sort]);

  const replay = selectedGame?.replay ?? [];
  const currentStep = replay[Math.min(stepIndex, Math.max(0, replay.length - 1))] ?? null;

  return (
    <main className="viewer-shell">
      <header className="viewer-topbar">
        <div>
          <h1>Simulation Viewer</h1>
          <p>#27 の保存済み simulation run を読み取り専用で表示します。</p>
        </div>
        <button className="secondary" onClick={onBackToGame}>通常ゲームへ戻る</button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="viewer-section" aria-label="Simulation Run一覧">
        <h2>Simulation Run一覧</h2>
        <table>
          <thead>
            <tr>
              <th>runId</th>
              <th>作成日時</th>
              <th>game数</th>
              <th>completed / failed</th>
              <th>player数</th>
              <th>run seed</th>
              <th>agent構成</th>
              <th>schemaVersion</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId} className={run.runId === selectedRunId ? "selected-row" : ""}>
                <td>{run.runId}</td>
                <td>{run.createdAt}</td>
                <td>{run.gameCount}</td>
                <td>{run.completedGames} / {run.failedGames}</td>
                <td>{run.playerCount}</td>
                <td>{run.runSeed}</td>
                <td>{agentsText(run.agents)}</td>
                <td>{run.schemaVersion}</td>
                <td><button onClick={() => void loadRun(run.runId)}>開く</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 ? <p className="hint">simulation-results が見つかりません。</p> : null}
      </section>

      {details ? (
        <>
          <section className="viewer-section" aria-label="Run概要">
            <h2>Run概要</h2>
            <MetricGrid>
              <Metric label="game数" value={details.metadata.completedGames + details.metadata.failedGames} />
              <Metric label="completed / failed" value={`${details.metadata.completedGames} / ${details.metadata.failedGames}`} />
              <Metric label="player数" value={details.metadata.playerCount} />
              <Metric label="run seed" value={details.metadata.runSeed} />
              <Metric label="agent構成" value={agentsText(details.metadata.agents)} />
              <Metric label="schemaVersion" value={details.metadata.schemaVersion} />
            </MetricGrid>
          </section>

          <section className="viewer-section">
            <h2>得点・順位</h2>
            <MetricGrid>
              <Metric label="最終得点平均" value={numberText(details.analysis.score.averageFinalScore)} />
              <Metric label="最終得点中央値" value={numberText(details.analysis.score.medianFinalScore)} />
              <Metric label="1位と最下位の平均得点差" value={numberText(details.analysis.score.averageFirstLastScoreGap)} />
            </MetricGrid>
            <Histogram rows={details.analysis.score.scoreDistribution} />
            <div className="split-grid">
              <table>
                <caption>席順ごとの勝率</caption>
                <thead><tr><th>player index</th><th>勝率</th></tr></thead>
                <tbody>{Object.entries(details.analysis.score.winRateByPlayerIndex).map(([id, value]) => <tr key={id}><td>{id}</td><td>{percentText(value)}</td></tr>)}</tbody>
              </table>
              <table>
                <caption>席順ごとの平均順位</caption>
                <thead><tr><th>player index</th><th>平均順位</th></tr></thead>
                <tbody>{Object.entries(details.analysis.score.averageRankByPlayerIndex).map(([id, value]) => <tr key={id}><td>{id}</td><td>{numberText(value)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <LevelPanel stats={details.analysis.levels.level2} />
          <LevelPanel stats={details.analysis.levels.level3} />

          <section className="viewer-section">
            <h2>カード統計</h2>
            <table>
              <thead>
                <tr>
                  <th>カード</th><th>draft</th><th>使用</th><th>行動</th><th>得点</th><th>基本</th><th>用途割合</th><th>draft者平均得点</th><th>平均順位</th><th>勝率</th><th>特殊</th>
                </tr>
              </thead>
              <tbody>
                {details.analysis.cards.map((card) => (
                  <tr key={card.type}>
                    <td>{cardLabels[card.type]}</td>
                    <td>{card.draftCount}</td>
                    <td>{card.useCount}</td>
                    <td>{card.actionUseCount}</td>
                    <td>{card.scoringUseCount}</td>
                    <td>{card.basicUseCount}</td>
                    <td>{cardModesText(card.modeRatios)}</td>
                    <td>{numberText(card.drafterAverageFinalScore)}</td>
                    <td>{numberText(card.drafterAverageRank)}</td>
                    <td>{percentText(card.drafterWinRate)}</td>
                    <td>{specialCardText(card)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="viewer-section">
            <h2>都市統計</h2>
            <MetricGrid>
              <Metric label="1ゲームあたり平均都市駒数" value={numberText(details.analysis.cities.averageCityPiecesPerGame)} />
              <Metric label="Lv1都市平均建設数" value={numberText(details.analysis.cities.averageBuildsByLevel[1])} />
              <Metric label="Lv2都市平均建設数" value={numberText(details.analysis.cities.averageBuildsByLevel[2])} />
              <Metric label="Lv3都市平均建設数" value={numberText(details.analysis.cities.averageBuildsByLevel[3])} />
              <Metric label="空交点への建設回数" value={details.analysis.cities.emptyIntersectionBuilds} />
              <Metric label="既存スタックへの積層回数" value={details.analysis.cities.stackedCityBuilds} />
              <Metric label="積層率" value={percentText(details.analysis.cities.stackingRate)} />
              <Metric label="勝者の平均都市数" value={numberText(details.analysis.cities.winnerAverageCityCount)} />
              <Metric label="勝者Lv別都市構成" value={`Lv1 ${numberText(details.analysis.cities.winnerAverageCitiesByLevel[1])} / Lv2 ${numberText(details.analysis.cities.winnerAverageCitiesByLevel[2])} / Lv3 ${numberText(details.analysis.cities.winnerAverageCitiesByLevel[3])}`} />
            </MetricGrid>
          </section>

          <section className="viewer-section">
            <h2>エリア統計</h2>
            <MetricGrid>
              {Object.entries(details.analysis.areas.finalAverageAreaCounts).map(([color, value]) => (
                <Metric key={color} label={`最終盤面 ${areaColorLabels[color as AreaColor]}エリア平均数`} value={numberText(value)} />
              ))}
              <Metric label="色変更回数" value={details.analysis.areas.colorChangeCount ?? "ログなし"} />
              <Metric label="中立化回数" value={details.analysis.areas.neutralizationCount ?? "ログなし"} />
            </MetricGrid>
            <div className="split-grid">
              <table>
                <caption>ラウンド終了時の色分布</caption>
                <thead><tr><th>round</th>{Object.values(areaColorLabels).map((label) => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>
                  {details.analysis.areas.roundEndColorDistribution.map((row) => (
                    <tr key={row.round}><td>{row.round}</td>{(["red", "blue", "yellow", "neutral"] as AreaColor[]).map((color) => <td key={color}>{row.colors[color]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <table>
                <caption>中立エリア数のラウンド推移</caption>
                <thead><tr><th>round</th><th>平均中立エリア数</th></tr></thead>
                <tbody>{details.analysis.areas.neutralAreaTrend.map((row) => <tr key={row.round}><td>{row.round}</td><td>{numberText(row.averageNeutralAreas)}</td></tr>)}</tbody>
              </table>
              <table>
                <caption>ラウンド終了時のArea Lv分布</caption>
                <thead><tr><th>round</th><th>Lv0</th><th>Lv1</th><th>Lv2</th><th>Lv3</th></tr></thead>
                <tbody>
                  {details.analysis.areas.roundEndAreaLevelDistribution.map((row) => (
                    <tr key={row.round}><td>{row.round}</td><td>{row.levels[0]}</td><td>{row.levels[1]}</td><td>{row.levels[2]}</td><td>{row.levels[3]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="viewer-section" aria-label="Game一覧">
            <h2>Game一覧</h2>
            <div className="viewer-controls">
              <label>フィルタ<select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">すべて</option>
                <option value="large-gap">得点差が大きい</option>
                <option value="close">接戦</option>
                <option value="no-lv3">Lv3未到達</option>
                <option value="early-lv3">Lv3早期到達</option>
              </select></label>
              <label>ソート<select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="gap-desc">得点差 大きい順</option>
                <option value="gap-asc">得点差 小さい順</option>
                <option value="seed">seed</option>
                <option value="winner">勝者</option>
                <option value="lv3">Lv3到達タイミング</option>
              </select></label>
            </div>
            <table>
              <thead><tr><th>gameId</th><th>gameSeed</th><th>最終得点</th><th>勝者</th><th>Lv2</th><th>Lv3</th><th>最終世界Lv</th><th>得点差</th><th>タグ</th><th></th></tr></thead>
              <tbody>
                {filteredGames.map((game) => (
                  <tr key={game.gameId} className={game.gameId === selectedGameId ? "selected-row" : ""}>
                    <td>{game.gameId}</td>
                    <td>{game.gameSeed}</td>
                    <td>{game.finalScores.map((score) => `${score.playerId}:${score.score}`).join(" / ")}</td>
                    <td>{game.winners.join(", ") || "なし"}</td>
                    <td>{timingText(game.level2Timing)}</td>
                    <td>{timingText(game.level3Timing)}</td>
                    <td>{game.finalWorldLevel ?? "なし"}</td>
                    <td>{game.scoreGap ?? "なし"}</td>
                    <td>{game.tags.map(tagLabel).join(" / ")}</td>
                    <td><button onClick={() => void loadGame(game.gameId)}>Replay</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {currentStep ? (
        <section className="replay-shell" aria-label="個別ゲーム再生Viewer">
          <div className="replay-header">
            <div>
              <h2>Replay {selectedGame?.gameId}</h2>
              <p>step {currentStep.step} / {replay.length - 1}</p>
            </div>
            <div className="icon-actions">
              <button aria-label="先頭へ" onClick={() => setStepIndex(0)} disabled={stepIndex === 0}><ChevronsLeft size={18} /></button>
              <button aria-label="1step戻る" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0}><ChevronLeft size={18} /></button>
              <button aria-label="1step進む" onClick={() => setStepIndex((current) => Math.min(replay.length - 1, current + 1))} disabled={stepIndex >= replay.length - 1}><ChevronRight size={18} /></button>
              <button aria-label="最後へ" onClick={() => setStepIndex(replay.length - 1)} disabled={stepIndex >= replay.length - 1}><ChevronsRight size={18} /></button>
            </div>
          </div>
          <div className="replay-grid">
            <Board state={currentStep.snapshot} interactive={false} />
            <aside className="replay-side">
              <MetricGrid>
                <Metric label="世界Lv" value={currentStep.snapshot.worldLevel} />
                <Metric label="round / phase" value={`${currentStep.snapshot.round} / ${currentStep.snapshot.phase}`} />
                <Metric label="盤面キューブ" value={currentStep.snapshot.boardCubeTotal} />
              </MetricGrid>
              <table>
                <caption>プレイヤー状態</caption>
                <thead><tr><th>player</th><th>得点</th><th>手持ちキューブ</th></tr></thead>
                <tbody>
                  {currentStep.snapshot.players.map((player) => (
                    <tr key={player.id}>
                      <td>{player.id}</td>
                      <td>{player.finalScore}</td>
                      <td>{cubeColors.map((color) => `${colorLabels[color]}${player.cubes[color]}`).join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table>
                <caption>都市スタック</caption>
                <thead><tr><th>交点</th><th>都市所有者</th></tr></thead>
                <tbody>
                  {currentStep.snapshot.intersections.filter((intersection) => intersection.cityStack.length > 0).map((intersection) => (
                    <tr key={intersection.id}>
                      <td>{intersection.id}</td>
                      <td>{intersection.cityStack.map((city) => `${city.playerId} Lv${city.level}`).join(" / ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <EventDetails step={currentStep} />
            </aside>
          </div>
        </section>
      ) : null}
    </main>
  );
};

const cardModesText = (ratios: Record<CardUseMode, number>) =>
  (["production", "scoring", "basic"] as CardUseMode[])
    .map((mode) => `${modeLabels[mode]} ${percentText(ratios[mode])}`)
    .join(" / ");

const specialCardText = (card: CardStats) => {
  if (card.type === "tricolor-city") {
    return `ボーナス ${card.tricolorBonusCount ?? 0} / 発動率 ${percentText(card.tricolorBonusRate)}`;
  }
  if (card.type === "neutral-development") {
    return `ボーナス ${card.neutralDevelopmentBonusCount ?? 0} / 平均取得 ${numberText(card.neutralDevelopmentAverageBonusCubes)} / 最大 ${card.neutralDevelopmentMaxBonusCubes ?? 0}`;
  }
  return "";
};
