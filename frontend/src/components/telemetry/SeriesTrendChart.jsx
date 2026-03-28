import { useEffect, useState } from "react";

function buildLinePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildAreaPath(points, baselineY) {
  if (points.length === 0) {
    return "";
  }

  return `${buildLinePath(points)} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
}

export default function SeriesTrendChart({
  data,
  series,
  unit,
  emptyMessage,
  summaryLabel = "Selected slot",
}) {
  const [hoveredIndex, setHoveredIndex] = useState(Math.max(data.length - 1, 0));

  useEffect(() => {
    setHoveredIndex(Math.max(data.length - 1, 0));
  }, [data.length]);

  if (data.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-white/8 bg-black/20 px-4 py-10 text-center text-sm text-white/55">
        {emptyMessage}
      </div>
    );
  }

  const width = 860;
  const height = 220;
  const paddingX = 34;
  const paddingTop = 20;
  const paddingBottom = 34;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(
    1,
    ...data.flatMap((point) => series.map((entry) => point[entry.key] ?? 0)),
  );
  const guideSteps = 4;
  const activeIndex = Math.min(Math.max(hoveredIndex, 0), data.length - 1);
  const activePoint = data[activeIndex];

  function xForIndex(index) {
    if (data.length === 1) {
      return width / 2;
    }

    return paddingX + (index / (data.length - 1)) * plotWidth;
  }

  function yForValue(value) {
    return paddingTop + plotHeight - (value / maxValue) * plotHeight;
  }

  const seriesPoints = Object.fromEntries(
    series.map((entry) => [
      entry.key,
      data.map((point, index) => ({
        x: xForIndex(index),
        y: yForValue(point[entry.key]),
      })),
    ]),
  );

  function handleMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - bounds.left;
    const ratio = bounds.width === 0 ? 0 : relativeX / bounds.width;
    const nextIndex = Math.round(ratio * (data.length - 1));
    setHoveredIndex(Math.min(Math.max(nextIndex, 0), data.length - 1));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
          <div className="text-[0.62rem] uppercase tracking-[0.28em] text-white/40">
            {summaryLabel}
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white">
            {activePoint.label}
          </div>
        </div>
        <div className={`grid min-w-[240px] gap-2 ${series.length > 2 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"}`}>
          {series.map((entry) => (
            <div
              key={entry.key}
              className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                {entry.label}
              </div>
              <div className="mt-1 font-mono text-lg font-bold" style={{ color: entry.color }}>
                {activePoint[entry.key].toFixed(1)} {unit}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/20 px-3 py-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ display: "block" }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoveredIndex(data.length - 1)}>
          <defs>
            {series.map((entry) => (
              <linearGradient key={entry.key} id={`trend-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={entry.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={entry.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {Array.from({ length: guideSteps + 1 }).map((_, index) => {
            const value = (maxValue / guideSteps) * index;
            const y = yForValue(value);

            return (
              <g key={index}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="4 8"
                />
                <text
                  x={paddingX - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.38)"
                  fontSize="9"
                  fontFamily="monospace">
                  {value.toFixed(1)}
                </text>
              </g>
            );
          })}

          {data.map((point, index) => (
            <text
              key={point.label}
              x={xForIndex(index)}
              y={height - 10}
              textAnchor="middle"
              fill="rgba(255,255,255,0.38)"
              fontSize="9"
              fontFamily="monospace">
              {point.label}
            </text>
          ))}

          {series.map((entry) => (
            <path
              key={`${entry.key}-area`}
              d={buildAreaPath(seriesPoints[entry.key], paddingTop + plotHeight)}
              fill={`url(#trend-${entry.key})`}
            />
          ))}

          {series.map((entry) => (
            <path
              key={`${entry.key}-line`}
              d={buildLinePath(seriesPoints[entry.key])}
              fill="none"
              stroke={entry.color}
              strokeWidth={entry.key === series[0]?.key ? 2.4 : 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          <line
            x1={xForIndex(activeIndex)}
            y1={paddingTop}
            x2={xForIndex(activeIndex)}
            y2={paddingTop + plotHeight}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="4 6"
          />

          {series.map((entry) => (
            <g key={`${entry.key}-dot`}>
              <circle
                cx={xForIndex(activeIndex)}
                cy={yForValue(activePoint[entry.key])}
                r={6}
                fill={entry.color}
                opacity={0.14}
              />
              <circle
                cx={xForIndex(activeIndex)}
                cy={yForValue(activePoint[entry.key])}
                r={3.2}
                fill={entry.color}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
