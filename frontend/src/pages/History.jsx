import { MetricCard, SignalRow } from "../components/dashboard/ConsoleUi";
import FlowTrendChart from "../components/dashboard/FlowTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import {
  averageSeriesValue,
  buildCombinedTrendData,
  buildRecentBars,
  formatPointTimestamp,
  maxSeriesValue,
} from "../lib/energyTelemetry";

function formatWatts(value) {
  return `${value.toFixed(0)} W`;
}

function formatGasFlow(value) {
  return `${value.toFixed(3)} m3/h`;
}

function SampleRow({ label, timestamp, value, tone }) {
  return (
    <div className="flex items-center justify-between rounded-[1.3rem] border border-white/8 bg-black/20 px-4 py-3">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-white/45">{formatPointTimestamp(timestamp)}</div>
      </div>
      <span className="font-mono text-sm" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}

export default function History() {
  const { history, error } = useEnergyData({
    includeNow: false,
    includeToday: false,
    refreshMs: 30000,
  });

  const trendData = buildCombinedTrendData(history);
  const consumptionPoints = history?.consumption ?? [];
  const productionPoints = history?.production ?? [];
  const gasPoints = history?.gas ?? [];
  const recentConsumption = buildRecentBars(
    consumptionPoints,
    6,
    formatWatts,
  ).reverse();
  const recentProduction = buildRecentBars(
    productionPoints,
    3,
    (value) => formatWatts(value),
  ).reverse();
  const recentGas = buildRecentBars(gasPoints, 3, formatGasFlow).reverse();

  const avgConsumption = averageSeriesValue(consumptionPoints);
  const peakConsumption = maxSeriesValue(consumptionPoints);
  const avgProduction = averageSeriesValue(productionPoints);
  const avgGas = averageSeriesValue(gasPoints);

  return (
    <div className="page-wrap">
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div
          className="absolute inset-0 opacity-80"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(59,130,246,0.16), transparent 24%), radial-gradient(circle at 85% 18%, rgba(251,191,36,0.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
          }}
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="hero-kicker">History deck</p>
            <h1 className="page-title max-w-3xl">
              Trend analysis now looks like part of the product instead of a utility page.
            </h1>
            <p className="page-subtitle max-w-2xl">
              Consumption, solar production, and gas flow all read from the same historical store
              and are presented with the same control-room language as the dashboard.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Consumption points
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {consumptionPoints.length}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Production points
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {productionPoints.length}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Gas points
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {gasPoints.length}
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

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="order-2 space-y-4 xl:order-1">
          <MetricCard
            eyebrow="Consumption"
            label="Average draw"
            value={formatWatts(avgConsumption)}
            subcopy="Mean household load across the visible history window."
            accent="#3b82f6"
          />
          <MetricCard
            eyebrow="Peak"
            label="Highest draw"
            value={formatWatts(peakConsumption)}
            subcopy="Largest visible consumption sample in this range."
            accent="#f59e0b"
          />
          <MetricCard
            eyebrow="Solar"
            label="Average production"
            value={formatWatts(avgProduction)}
            subcopy="Mean solar output across the visible history window."
            accent="#fbbf24"
          />
          <MetricCard
            eyebrow="Gas"
            label="Average gas flow"
            value={formatGasFlow(avgGas)}
            subcopy="Mean gas-flow value across the visible history window."
            accent="#22d3ee"
          />
        </div>

        <div className="order-1 space-y-4 xl:order-2">
          <section className="card rounded-[2rem]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kicker">Unified ribbon</p>
                <p className="card-header mb-1">Consumption versus production</p>
                <p className="text-sm text-white/55">
                  The trend ribbon gives the historical pages the same visual rhythm as the live dashboard.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/72">
                {trendData.length > 0 ? `${trendData.length} hourly buckets` : "Waiting for history"}
              </div>
            </div>
            <FlowTrendChart data={trendData} />
          </section>

          <section className="card rounded-[2rem]">
            <div className="mb-4">
              <p className="kicker">Recent samples</p>
              <p className="card-header mb-1">Last visible telemetry points</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-3">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/38">
                  Consumption
                </div>
                {recentConsumption.length === 0 && (
                  <div className="rounded-[1.3rem] border border-white/8 bg-black/20 px-4 py-5 text-sm text-white/48">
                    No consumption samples yet.
                  </div>
                )}
                {recentConsumption.map((point) => (
                  <SampleRow
                    key={point.timestamp}
                    label={point.label}
                    timestamp={point.timestamp}
                    value={point.formattedValue}
                    tone="#3b82f6"
                  />
                ))}
              </div>

              <div className="space-y-3">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/38">
                  Production
                </div>
                {recentProduction.length === 0 && (
                  <div className="rounded-[1.3rem] border border-white/8 bg-black/20 px-4 py-5 text-sm text-white/48">
                    No production samples yet.
                  </div>
                )}
                {recentProduction.map((point) => (
                  <SampleRow
                    key={point.timestamp}
                    label={point.label}
                    timestamp={point.timestamp}
                    value={point.formattedValue}
                    tone="#fbbf24"
                  />
                ))}
              </div>

              <div className="space-y-3">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/38">
                  Gas
                </div>
                {recentGas.length === 0 && (
                  <div className="rounded-[1.3rem] border border-white/8 bg-black/20 px-4 py-5 text-sm text-white/48">
                    No gas samples yet.
                  </div>
                )}
                {recentGas.map((point) => (
                  <SampleRow
                    key={point.timestamp}
                    label={point.label}
                    timestamp={point.timestamp}
                    value={point.formattedValue}
                    tone="#22d3ee"
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="order-3 space-y-4">
          <section className="card space-y-3 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Pipeline state</p>
              <p className="card-header mb-1">History integrity</p>
            </div>
            <SignalRow
              label="Consumption history"
              value={consumptionPoints.length > 0 ? "loaded" : "empty"}
              tone={consumptionPoints.length > 0 ? "ok" : "idle"}
            />
            <SignalRow
              label="Production history"
              value={productionPoints.length > 0 ? "loaded" : "empty"}
              tone={productionPoints.length > 0 ? "ok" : "idle"}
            />
            <SignalRow
              label="Gas history"
              value={gasPoints.length > 0 ? "loaded" : "empty"}
              tone={gasPoints.length > 0 ? "ok" : "idle"}
            />
            <SignalRow
              label="Unified ribbon"
              value={trendData.length > 0 ? "ready" : "warming up"}
              tone={trendData.length > 0 ? "info" : "idle"}
            />
          </section>

          <section className="card rounded-[1.9rem] p-5">
            <p className="kicker">Why it changed</p>
            <p className="card-header mb-2">A better historical surface</p>
            <p className="text-sm leading-6 text-white/58">
              The old page was functional but visually disconnected from the new dashboard.
              This pass keeps the same historical data while presenting it with clearer hierarchy,
              better scanability, and a stronger mobile-first order.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
