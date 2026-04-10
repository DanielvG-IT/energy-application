import SeriesTrendChart from "../telemetry/SeriesTrendChart";
import { formatAxisPower, formatPower } from "../../lib/powerFormatting";

const SERIES = [
  { key: "solar", label: "Solar", color: "#f5a524" },
  { key: "grid", label: "Grid", color: "#ff7a59" },
  { key: "home", label: "Home", color: "#5ad4ff" },
  { key: "reserve", label: "Reserve", color: "#5ed9b4" },
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
