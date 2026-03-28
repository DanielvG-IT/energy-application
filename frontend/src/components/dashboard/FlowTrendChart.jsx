import SeriesTrendChart from "../telemetry/SeriesTrendChart";
import { formatAxisPower, formatPower } from "../../lib/powerFormatting";

const SERIES = [
  { key: "solar", label: "Solar", color: "#fbbf24" },
  { key: "grid", label: "Grid", color: "#8b5cf6" },
  { key: "home", label: "Home", color: "#3b82f6" },
  { key: "reserve", label: "Reserve", color: "#10b981" },
];

export default function FlowTrendChart({ data }) {
  return (
    <SeriesTrendChart
      data={data}
      series={SERIES}
      unit="kW"
      summaryLabel="Selected hour"
      emptyMessage="Waiting for enough hourly history to draw the trend line."
      valueFormatter={formatPower}
      axisFormatter={formatAxisPower}
    />
  );
}
