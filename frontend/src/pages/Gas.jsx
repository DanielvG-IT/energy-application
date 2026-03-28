import {
  MetricCard,
  SignalRow,
} from "../components/dashboard/ConsoleUi";
import SeriesTrendChart from "../components/telemetry/SeriesTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import {
  averageSeriesValue,
  buildGasTrendData,
  buildRecentBars,
  maxSeriesValue,
} from "../lib/energyTelemetry";

const GAS_SERIES = [{ key: "gas", label: "Gas flow", color: "#22d3ee" }];

function formatGas(value) {
  return `${value.toFixed(3)} m3/h`;
}

export default function Gas() {
  const { now, today, history, error } = useEnergyData({ refreshMs: 30000 });
  const summary = today.summary;
  const gasTrend = buildGasTrendData(history);
  const recentBars = buildRecentBars(history?.gas, 6, (value) => formatGas(value));

  const gasFlow = Math.max(0, now?.gasFlowM3h ?? 0);
  const gasToday = summary?.gasM3 ?? 0;
  const avgGas = averageSeriesValue(history?.gas);
  const peakGas = maxSeriesValue(history?.gas);

  return (
    <div className="page-wrap">
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div
          className="absolute inset-0 opacity-80"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 24%), radial-gradient(circle at 85% 15%, rgba(59,130,246,0.12), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
          }}
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="hero-kicker">Gas flow</p>
            <h1 className="page-title max-w-3xl">
              The gas page is now live instead of placeholder content.
            </h1>
            <p className="page-subtitle max-w-2xl">
              Current flow, today's accumulated usage, and recent rhythm all come from the
              same telemetry stream as the rest of the app.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Live flow
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatGas(gasFlow)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Today
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {gasToday.toFixed(2)} m3
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Peak recent
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatGas(peakGas)}
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
              <p className="kicker">Flow ribbon</p>
              <p className="card-header mb-1">Recent gas cadence</p>
              <p className="text-sm text-white/55">
                The chart shows live gas-flow samples over the latest captured windows.
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

          <section className="card space-y-3 rounded-[2rem] p-5">
            <div>
              <p className="kicker">Recent pulses</p>
              <p className="card-header mb-1">Latest meter snapshots</p>
            </div>
            {recentBars.length === 0 && (
              <p className="text-sm text-white/55">
                No recent gas samples yet.
              </p>
            )}
            {recentBars.map((point) => (
              <div key={point.timestamp} className="space-y-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-mono text-white/80">{point.label}</span>
                  <span className="font-mono text-white">{point.formattedValue}</span>
                </div>
                <div className="h-2 rounded-full bg-white/6">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${point.widthPct}%`,
                      background: "#22d3ee",
                      boxShadow: "0 0 12px rgba(34,211,238,0.45)",
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="order-2 space-y-4">
          <MetricCard
            eyebrow="Live"
            label="Current flow"
            value={formatGas(gasFlow)}
            subcopy="This is the current gas-flow rate from the meter feed."
            accent="#22d3ee"
          />
          <MetricCard
            eyebrow="Daily"
            label="Used today"
            value={`${gasToday.toFixed(2)} m3`}
            subcopy="Accumulated gas usage across the current day."
            accent="#38bdf8"
          />
          <MetricCard
            eyebrow="Average"
            label="Rolling mean"
            value={formatGas(avgGas)}
            subcopy="Average recent gas-flow reading across the history window."
            accent="#0ea5e9"
          />

          <div className="card space-y-3 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Telemetry health</p>
              <p className="card-header mb-1">What the stream is telling us</p>
            </div>
            <SignalRow
              label="Meter stream"
              value={now ? "streaming" : "waiting"}
              tone={now ? "ok" : "idle"}
            />
            <SignalRow
              label="History samples"
              value={history?.gas?.length ? `${history.gas.length} points` : "warming up"}
              tone={history?.gas?.length ? "info" : "idle"}
            />
            <SignalRow
              label="Average recent flow"
              value={formatGas(avgGas)}
              tone="info"
            />
            <SignalRow
              label="Peak recent flow"
              value={formatGas(peakGas)}
              tone={peakGas > avgGas ? "warn" : "idle"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
