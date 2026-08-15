import { cubeColors, type CardSummary, type CubeColor, type PlayerSummary } from "@sdb/protocol";

const colorLabels: Record<CubeColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
};

const cardColorLabels: Record<CardSummary["color"], string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  multi: "三色",
};

const cardIconText: Record<CardSummary["color"], string> = {
  red: "R",
  blue: "B",
  yellow: "Y",
  multi: "RGB",
};

export const PlayerStrip = ({
  players,
  currentPlayerId,
}: {
  players: PlayerSummary[];
  currentPlayerId: string | null;
}) => (
  <section className="player-strip" aria-label="プレイヤー">
    {players.map((player) => (
      <article
        key={player.id}
        className={`player-card ${player.id === currentPlayerId ? "active" : ""}`}
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
);

export const GameCard = ({
  card,
  selected = false,
  disabled = false,
  readOnly = false,
  highlight = false,
  onSelect,
}: {
  card: CardSummary;
  selected?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  highlight?: boolean;
  onSelect?: (card: CardSummary) => void;
}) => {
  const className = [
    "game-card",
    `card-${card.color}`,
    selected ? "selected" : "",
    highlight ? "highlight" : "",
    readOnly ? "readonly-card" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <div className="game-card-band">
        <span className="card-token" aria-hidden="true">{cardIconText[card.color]}</span>
        <strong>{card.name}</strong>
        <span className="card-color-label">{cardColorLabels[card.color]}</span>
      </div>
      <div className="game-card-body">
        <span className="card-mode-label">行動</span>
        <p>{card.actionText}</p>
        <span className="card-mode-label">得点</span>
        <p>{card.scoringText}</p>
      </div>
    </>
  );

  if (readOnly) {
    return <article className={className}>{content}</article>;
  }

  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect?.(card)}
    >
      {content}
    </button>
  );
};
