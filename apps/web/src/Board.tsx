import { useState } from "react";
import { cubeColors, type AreaColor, type CubeColor, type PublicGameState } from "@sdb/protocol";

type BoardState = Pick<PublicGameState, "status" | "areas" | "intersections" | "areaCapacity">;

const areaColorLabels: Record<AreaColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  neutral: "中立",
};

const minBoardZoom = 0.75;
const maxBoardZoom = 1.5;
const boardZoomStep = 0.25;

const clampBoardZoom = (value: number) =>
  Math.min(maxBoardZoom, Math.max(minBoardZoom, value));

const cubeColorLabels: Record<CubeColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
};

const cubeOffsets = [
  { x: 0, y: 0 },
  { x: -8, y: -8 },
  { x: 8, y: -16 },
];

const renderCubePiece = (color: CubeColor, x: number, y: number, key: string) => (
  <g key={key} className={`cube-piece ${color}`} transform={`translate(${x} ${y})`}>
    <path className="cube-top" d="M 0 -14 L 13 -7 L 0 0 L -13 -7 Z" />
    <path className="cube-left" d="M -13 -7 L 0 0 L 0 15 L -13 8 Z" />
    <path className="cube-right" d="M 13 -7 L 0 0 L 0 15 L 13 8 Z" />
  </g>
);

const renderCubePile = (areaId: string, color: CubeColor, count: number, x: number, y: number) => {
  if (count === 0) {
    return (
      <g key={color} className="cube-slot-empty" transform={`translate(${x} ${y})`} aria-hidden="true">
        <rect x="-11" y="-7" width="22" height="14" rx="3" />
      </g>
    );
  }

  const visibleCount = Math.min(count, cubeOffsets.length);
  return (
    <g
      key={color}
      className={`cube-pile ${color}`}
      data-testid={`cube-pile-${areaId}-${color}`}
      aria-label={`${cubeColorLabels[color]}キューブ ${count}個`}
      transform={`translate(${x} ${y})`}
    >
      {Array.from({ length: visibleCount }, (_, index) =>
        renderCubePiece(color, cubeOffsets[index].x, cubeOffsets[index].y, `${color}-${index}`)
      )}
      {count > visibleCount ? (
        <text className="cube-multiplier" x="17" y="-13">
          x{count}
        </text>
      ) : null}
    </g>
  );
};

const renderDevelopmentNotches = (level: number, x: number, y: number) =>
  Array.from({ length: 3 }, (_, index) => (
    <rect
      key={index}
      className={`level-notch ${index < level ? "filled" : ""}`}
      x={x - 20 + index * 15}
      y={y}
      width="10"
      height={index < level ? 22 : 10}
      rx="2"
    />
  ));

const renderCityPiece = (
  city: PublicGameState["intersections"][number]["cityStack"][number],
  x: number,
  y: number,
  key: string
) => (
  <g
    key={key}
    className={`city-piece level-${city.level}`}
    data-testid={key}
    aria-label={`${city.playerId}のLv${city.level}都市`}
    transform={`translate(${x} ${y})`}
  >
    {Array.from({ length: city.level }, (_, tier) => (
      <g key={tier} transform={`translate(0 ${-tier * 8})`}>
        <ellipse className="city-tier-top" cx="0" cy="-8" rx="16" ry="5" fill={city.playerColor} />
        <rect className="city-tier-body" x="-16" y="-8" width="32" height="12" rx="3" fill={city.playerColor} />
        <ellipse className="city-tier-base" cx="0" cy="4" rx="16" ry="5" fill={city.playerColor} />
      </g>
    ))}
  </g>
);

export const Board = ({
  state,
  selectedAreaId = "",
  selectedIntersectionId = "",
  placeableAreaIds = [],
  buildableIntersectionIds = [],
  interactive = true,
  onAreaSelect = () => {},
  onIntersectionSelect = () => {},
}: {
  state: BoardState;
  selectedAreaId?: string;
  selectedIntersectionId?: string;
  placeableAreaIds?: string[];
  buildableIntersectionIds?: string[];
  interactive?: boolean;
  onAreaSelect?: (id: string) => void;
  onIntersectionSelect?: (id: string) => void;
}) => {
  const [zoom, setZoom] = useState(1);
  const xCoordinates = [...state.areas.map((area) => area.x), ...state.intersections.map((item) => item.x)];
  const yCoordinates = [...state.areas.map((area) => area.y), ...state.intersections.map((item) => item.y)];
  const boardPadding = 98;
  const minX = Math.min(...xCoordinates) - boardPadding;
  const maxX = Math.max(...xCoordinates) + boardPadding;
  const minY = Math.min(...yCoordinates) - boardPadding;
  const maxY = Math.max(...yCoordinates) + boardPadding;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <section className="board-panel" aria-label="盤面">
      <div className="board-toolbar" aria-label="盤面Zoom">
        <button
          type="button"
          aria-label="盤面を縮小"
          title="盤面を縮小"
          onClick={() => setZoom((current) => clampBoardZoom(current - boardZoomStep))}
          disabled={zoom <= minBoardZoom}
        >
          -
        </button>
        <span data-testid="board-zoom-readout">{zoomPercent}%</span>
        <button
          type="button"
          aria-label="盤面を100%に戻す"
          title="盤面を100%に戻す"
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
        >
          100%
        </button>
        <button
          type="button"
          aria-label="盤面を拡大"
          title="盤面を拡大"
          onClick={() => setZoom((current) => clampBoardZoom(current + boardZoomStep))}
          disabled={zoom >= maxBoardZoom}
        >
          +
        </button>
      </div>
      <div className="board-viewport">
        <svg
          data-testid="board-svg"
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
          role="img"
          aria-label="六角形盤面"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          <defs>
            <linearGradient id="hex-red" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#c96b60" />
              <stop offset="100%" stopColor="#7e332e" />
            </linearGradient>
            <linearGradient id="hex-blue" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#6396c4" />
              <stop offset="100%" stopColor="#244e75" />
            </linearGradient>
            <linearGradient id="hex-yellow" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#d7b75a" />
              <stop offset="100%" stopColor="#816a2c" />
            </linearGradient>
            <linearGradient id="hex-neutral" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#858276" />
              <stop offset="100%" stopColor="#484940" />
            </linearGradient>
            <pattern id="hex-grain" width="18" height="18" patternUnits="userSpaceOnUse">
              <path d="M 0 8 H 18 M 8 0 V 18" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1" />
            </pattern>
          </defs>
          {state.areas.map((area) => {
            const points = Array.from({ length: 6 }, (_, index) => {
              const angle = ((30 + index * 60) * Math.PI) / 180;
              return `${area.x + 86 * Math.cos(angle)},${area.y + 86 * Math.sin(angle)}`;
            }).join(" ");
            const selectable =
              interactive && state.status === "active" && placeableAreaIds.includes(area.id);
            const areaSummary =
              `${area.label}: ${areaColorLabels[area.areaColor]}エリア、Lv${area.areaLevel}、` +
              `キューブ ${area.cubeTotal}/${state.areaCapacity}、` +
              cubeColors.map((color) => `${cubeColorLabels[color]}${area.cubes[color]}`).join(" ");
            return (
              <g key={area.id} className="area-cell" aria-label={areaSummary}>
                <polygon
                  points={points}
                  data-testid={`area-${area.id}`}
                  className={`hex ${area.areaColor} ${selectable ? "selectable" : ""} ${selectedAreaId === area.id ? "selected" : ""}`}
                  onClick={() => selectable && onAreaSelect(area.id)}
                />
                <polygon points={points} className="hex-grain" aria-hidden="true" />
                {renderDevelopmentNotches(area.areaLevel, area.x, area.y - 61)}
                <g className="area-level-badge" transform={`translate(${area.x + 47} ${area.y - 51})`}>
                  <circle r="12" />
                  <text y="3">{area.areaLevel}</text>
                </g>
                <g className="capacity-track" aria-label={`容量 ${area.cubeTotal}/${state.areaCapacity}`}>
                  {Array.from({ length: state.areaCapacity }, (_, index) => (
                    <rect
                      key={index}
                      className={`capacity-slot ${index < area.cubeTotal ? "filled" : ""}`}
                      x={area.x - (state.areaCapacity * 14) / 2 + index * 14}
                      y={area.y + 52}
                      width="10"
                      height="6"
                      rx="2"
                    />
                  ))}
                </g>
                <text x={area.x} y={area.y + 72} className="area-name">
                  {area.label}
                </text>
                {cubeColors.map((color, index) =>
                  renderCubePile(area.id, color, area.cubes[color], area.x - 34 + index * 34, area.y + 12)
                )}
                <title>{areaSummary}</title>
              </g>
            );
          })}
          {state.intersections.map((intersection) => {
            const legalBuild = buildableIntersectionIds.includes(intersection.id);
            const selectable = interactive && state.status === "active" && legalBuild;
            const stackLabel = intersection.cityStack.length
              ? intersection.cityStack.map((city) => `${city.playerId} Lv${city.level}`).join(" / ")
              : "空";
            return (
              <g
                key={intersection.id}
                data-testid={`intersection-${intersection.id}`}
                className={`intersection ${selectable ? "selectable" : ""} ${selectedIntersectionId === intersection.id ? "selected" : ""}`}
                aria-label={`${intersection.id}: ${stackLabel}`}
                onClick={() => selectable && onIntersectionSelect(intersection.id)}
              >
                {intersection.cityStack.length === 0 ? (
                  <>
                    <circle className="intersection-socket" cx={intersection.x} cy={intersection.y} r={legalBuild ? 13 : 9} />
                    {legalBuild ? (
                      <circle className="buildable-ring" cx={intersection.x} cy={intersection.y} r="21" />
                    ) : null}
                  </>
                ) : (
                  <>
                    <circle className="city-foundation" cx={intersection.x} cy={intersection.y + 4} r="22" />
                    {legalBuild ? (
                      <circle className="buildable-ring" cx={intersection.x} cy={intersection.y} r="25" />
                    ) : null}
                    {intersection.cityStack.map((city, index) =>
                      renderCityPiece(
                        city,
                        intersection.x - (intersection.cityStack.length - 1) * 9 + index * 18,
                        intersection.y - index * 12,
                        `city-${intersection.id}-${index}`
                      )
                    )}
                  </>
                )}
                <title>{intersection.id}: {stackLabel}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
};
