import { roundPowerForChart } from "./powerFormatting";

function sortPoints(points) {
  return [...(points ?? [])].sort(
    (left, right) => new Date(left.timestamp) - new Date(right.timestamp),
  );
}

function formatHourLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function averageSeriesValue(points) {
  if (!points?.length) {
    return 0;
  }

  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

export function maxSeriesValue(points) {
  if (!points?.length) {
    return 0;
  }

  return Math.max(...points.map((point) => point.value));
}

export function lastSeriesPoint(points) {
  const sorted = sortPoints(points);
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

export function formatPointTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildCombinedTrendData(history, limit = 12) {
  const buckets = new Map();

  for (const point of history?.consumption ?? []) {
    const bucketTime = new Date(point.timestamp);
    bucketTime.setMinutes(0, 0, 0);
    const key = bucketTime.toISOString();
    const current = buckets.get(key) ?? {
      label: bucketTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      home: 0,
      solar: 0,
    };
    current.home = Math.max(point.value, 0) / 1000;
    buckets.set(key, current);
  }

  for (const point of history?.production ?? []) {
    const bucketTime = new Date(point.timestamp);
    bucketTime.setMinutes(0, 0, 0);
    const key = bucketTime.toISOString();
    const current = buckets.get(key) ?? {
      label: bucketTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      home: 0,
      solar: 0,
    };
    current.solar = Math.max(point.value, 0) / 1000;
    buckets.set(key, current);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => new Date(left) - new Date(right))
    .slice(-limit)
    .map(([, point]) => ({
      label: point.label,
      solar: roundPowerForChart(point.solar),
      home: roundPowerForChart(point.home),
      grid: roundPowerForChart(Math.max(point.home - point.solar, 0)),
      reserve: roundPowerForChart(Math.max(point.solar - point.home, 0)),
    }));
}

export function buildGasTrendData(history, limit = 12) {
  return sortPoints(history?.gas)
    .slice(-limit)
    .map((point) => ({
      label: formatHourLabel(point.timestamp),
      gas: Number(Math.max(point.value, 0).toFixed(3)),
    }));
}

export function buildRecentBars(points, limit = 6, formatter) {
  const sorted = sortPoints(points).slice(-limit);
  const peak = Math.max(...sorted.map((point) => point.value), 0.001);

  return sorted.map((point) => ({
    ...point,
    label: new Date(point.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    widthPct: (point.value / peak) * 100,
    formattedValue: formatter ? formatter(point.value) : String(point.value),
  }));
}
