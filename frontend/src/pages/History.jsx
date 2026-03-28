import {
  GaugeCard,
  MetricCard,
  SignalRow,
} from "../components/dashboard/ConsoleUi";
import FlowTrendChart from "../components/dashboard/FlowTrendChart";
import SeriesTrendChart from "../components/telemetry/SeriesTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import {
  averageSeriesValue,
  buildCombinedTrendData,
  buildGasTrendData,
  formatPointTimestamp,
  lastSeriesPoint,
  maxSeriesValue,
} from "../lib/energyTelemetry";

const GAS_SERIES = [{ key: "gas", label: "Gas flow", color: "#22d3ee" }];

function formatKw(value) {
  return `${value.toFixed(1)} kW`;
}

function formatGas(value) {
  return `${value.toFixed(3)} m3/h`;
}

export default function History() {
  const { today, history, error } = useEnergyData({
    includeNow: false,
    refreshMs: 60000,
  });
  const summary = today.summary;
  const powerTrend = buildCombinedTrendData(history);
  const gasTrend = buildGasTrendData(history);

  const avgHome = averageSeriesValue(history?.consumption) / 1000;
  const avgSolar = averageSeriesValue(history?.production) / 1000;
  const avgGas = averageSeriesValue(history?.gas);
  const peakHome = maxSeriesValue(history?.consumption) / 1000;
  const lastConsumption = lastSeriesPoint(history?.consumption);
  const lastProduction = lastSeriesPoint(history?.production);
  const lastGas = lastSeriesPoint(history?.gas);
  const solarCoverage = summary?.solarCoveragePct ?? 0;

  return (
    <div className="page-wrap">
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div
          className="absolute inset-0 opacity-80"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 24%), radial-gradient(circle at 85% 15%, rgba(251,191,36,0.12), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
          }}
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="hero-kicker">Historical view</p>
            <h1 className="page-title max-w-3xl">
              One consistent story for power, gas, and daily behavior.
            </h1>
            <p className="page-subtitle max-w-2xl">
              Instead of a generic stats page, history now reads like the rest of the console:
              strong telemetry cards, a live trend chart, and a separate gas ribbon.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Avg home
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatKw(avgHome)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Avg solar
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatKw(avgSolar)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Avg gas
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatGas(avgGas)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="card border-amber-400/25 bg-amber-300/10">
          <p className="text-sm text-amber-100">{error}</p>
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-1 space-y-4">
          <section className="card rounded-[2rem]">
            <div className="mb-4">
              <p className="kicker">Power history</p>
              <p className="card-header mb-1">Recent household profile</p>
              <p className="text-sm text-white/55">
                Solar, grid, home, and modeled reserve share one timeline.
              </p>
            </div>
            <FlowTrendChart data={powerTrend} />
          </section>

          <section className="card rounded-[2rem]">
            <div className="mb-4">
              <p className="kicker">Gas history</p>
              <p className="card-header mb-1">Recent gas rhythm</p>
              <p className="text-sm text-white/55">
                A dedicated gas ribbon keeps the unit separate from power metrics.
              </p>
            </div>
            <SeriesTrendChart
              data={gasTrend}
              series={GAS_SERIES}
              unit="m3/h"
              summaryLabel="Selected slot"
              emptyMessage="Waiting for enough gas history to draw a chart."
            />
          </section>
        </div>

        <div className="order-2 space-y-4">
          <MetricCard
            eyebrow="Average"
            label="Home draw"
            value={formatKw(avgHome)}
            subcopy="Average home demand across the history window."
            accent="#3b82f6"
          />
          <MetricCard
            eyebrow="Peak"
            label="Highest recent home draw"
            value={formatKw(peakHome)}
            subcopy="Useful for spotting spikes before diving into raw data."
            accent="#f59e0b"
          />
          <GaugeCard
            percent={solarCoverage}
            label="Today coverage"
            detail={`${solarCoverage.toFixed(0)}% of today's usage covered by solar.`}
            color="#fbbf24"
          />

          <div className="card space-y-3 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Latest samples</p>
              <p className="card-header mb-1">Most recent captured points</p>
            </div>
            <SignalRow
              label="Consumption"
              value={lastConsumption ? formatPointTimestamp(lastConsumption.timestamp) : "none yet"}
              tone={lastConsumption ? "info" : "idle"}
            />
            <SignalRow
              label="Production"
              value={lastProduction ? formatPointTimestamp(lastProduction.timestamp) : "none yet"}
              tone={lastProduction ? "ok" : "idle"}
            />
            <SignalRow
              label="Gas"
              value={lastGas ? formatPointTimestamp(lastGas.timestamp) : "none yet"}
              tone={lastGas ? "info" : "idle"}
            />
            <SignalRow
              label="History density"
              value={history?.consumption?.length ? `${history.consumption.length} power points` : "warming up"}
              tone={history?.consumption?.length ? "info" : "idle"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
