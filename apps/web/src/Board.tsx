import { useState } from "react";
import { cubeColors, type AreaColor, type PublicGameState } from "@sdb/protocol";

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
  const minX = Math.min(...xCoordinates) - 130;
  const maxX = Math.max(...xCoordinates) + 130;
  const minY = Math.min(...yCoordinates) - 130;
  const maxY = Math.max(...yCoordinates) + 130;
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
          {state.areas.map((area) => {
            const points = Array.from({ length: 6 }, (_, index) => {
              const angle = ((30 + index * 60) * Math.PI) / 180;
              return `${area.x + 86 * Math.cos(angle)},${area.y + 86 * Math.sin(angle)}`;
            }).join(" ");
            const selectable =
              interactive && state.status === "active" && placeableAreaIds.includes(area.id);
            return (
              <g key={area.id}>
                <polygon
                  points={points}
                  data-testid={`area-${area.id}`}
                  className={`hex ${area.areaColor} ${selectable ? "selectable" : ""} ${selectedAreaId === area.id ? "selected" : ""}`}
                  onClick={() => selectable && onAreaSelect(area.id)}
                />
                <text x={area.x} y={area.y - 36} className="area-label">
                  {area.label}
                </text>
                <text x={area.x} y={area.y - 13} className="area-count">
                  {areaColorLabels[area.areaColor]} Lv{area.areaLevel} {area.cubeTotal}/{state.areaCapacity}
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
                onClick={() => selectable && onIntersectionSelect(intersection.id)}
              >
                {intersection.cityStack.length === 0 ? (
                  <circle cx={intersection.x} cy={intersection.y} r={legalBuild ? 10 : 7} fill="#ffffff" />
                ) : (
                  intersection.cityStack.map((city, index) => (
                    <g key={`${intersection.id}-${index}-${city.playerId}`} transform={`translate(${intersection.x} ${intersection.y - index * 14})`}>
                      <rect className="city-stack-block" x="-13" y="-8" width="26" height="14" rx="2" fill={city.playerColor} />
                      <text className="city-stack-text" y="3">
                        L{city.level}
                      </text>
                    </g>
                  ))
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
