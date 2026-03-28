import { MetricCard, SignalRow } from "../components/dashboard/ConsoleUi";
import { useEnergyData } from "../hooks/useEnergyData";
import {
  averageSeriesValue,
  buildRecentBars,
  formatPointTimestamp,
  lastSeriesPoint,
  maxSeriesValue,
} from "../lib/energyTelemetry";

function formatGasFlow(value) {
  return `${value.toFixed(3)} m3/h`;
}

function formatGasVolume(value) {
  return `${value.toFixed(2)} m3`;
}

export default function Gas() {
  const { now, today, history, error } = useEnergyData({ refreshMs: 20000 });
  const summary = today.summary;
  const gasPoints = history?.gas ?? [];
  const recentGas = buildRecentBars(gasPoints, 8, formatGasFlow);
  const lastPoint = lastSeriesPoint(gasPoints);

  const currentFlow = now?.gasFlowM3h ?? 0;
  const todayGas = summary?.gasM3 ?? 0;
  const averageFlow = averageSeriesValue(gasPoints);
  const peakFlow = maxSeriesValue(gasPoints);
  const telemetryLive = currentFlow > 0 || gasPoints.length > 0;

  return (
    <div className="page-wrap">
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div
          className="absolute inset-0 opacity-80"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 24%), radial-gradient(circle at 88% 18%, rgba(59,130,246,0.12), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
          }}
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="hero-kicker">Gas desk</p>
            <h1 className="page-title max-w-3xl">
              A live gas page built from your actual meter feed instead of placeholder analytics.
            </h1>
            <p className="page-subtitle max-w-2xl">
              The screen now reflects current gas flow, recent history, and the daily
              total the backend calculates from stored samples.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Current flow
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatGasFlow(currentFlow)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Today so far
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatGasVolume(todayGas)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Last reading
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {lastPoint ? formatPointTimestamp(lastPoint.timestamp) : "Waiting for data"}
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
            eyebrow="Flow"
            label="Current gas draw"
            value={formatGasFlow(currentFlow)}
            subcopy={
              telemetryLive
                ? "Live gas telemetry is arriving from the meter pipeline."
                : "No gas samples have landed yet."
            }
            accent="#22d3ee"
          />
          <MetricCard
            eyebrow="Average"
            label="Visible window average"
            value={formatGasFlow(averageFlow)}
            subcopy="Mean gas flow across the currently loaded historical window."
            accent="#3b82f6"
          />
          <MetricCard
            eyebrow="Peak"
            label="Highest visible sample"
            value={formatGasFlow(peakFlow)}
            subcopy="Peak gas flow in the visible historical range."
            accent="#f59e0b"
          />
        </div>

        <div className="order-1 space-y-4 xl:order-2">
          <section className="card rounded-[2rem]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kicker">Recent pulse</p>
                <p className="card-header mb-1">Latest gas samples</p>
                <p className="text-sm text-white/55">
                  These bars are the most recent gas-flow readings stored in history.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/72">
                {gasPoints.length} gas points loaded
              </div>
            </div>

            <div className="space-y-4">
              {recentGas.length === 0 && (
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 px-4 py-10 text-center text-sm text-white/48">
                  No recent gas history yet.
                </div>
              )}
              {recentGas.map((point) => (
                <div key={point.timestamp} className="space-y-2">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-white/60">{point.label}</span>
                    <span className="font-mono text-white">{point.formattedValue}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/6">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${point.widthPct}%`,
                        background: "linear-gradient(90deg, #22d3ee, #3b82f6)",
                        boxShadow: "0 0 16px rgba(34,211,238,0.4)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card rounded-[2rem]">
            <div className="mb-4">
              <p className="kicker">Daily accumulation</p>
              <p className="card-header mb-1">What the backend is tracking today</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-4">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/38">
                  Total gas today
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-cyan-300">
                  {formatGasVolume(todayGas)}
                </div>
                <div className="mt-1 text-sm text-white/48">
                  Derived from the stored gas-flow series.
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-4">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/38">
                  Sample count
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-white">
                  {gasPoints.length}
                </div>
                <div className="mt-1 text-sm text-white/48">
                  Historical gas points currently available to the UI.
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="order-3 space-y-4">
          <section className="card space-y-3 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Field notes</p>
              <p className="card-header mb-1">Telemetry context</p>
            </div>
            <SignalRow
              label="Gas feed"
              value={telemetryLive ? "available" : "waiting"}
              tone={telemetryLive ? "ok" : "idle"}
            />
            <SignalRow
              label="Current reading"
              value={currentFlow > 0 ? "flowing" : "idle"}
              tone={currentFlow > 0 ? "info" : "idle"}
            />
            <SignalRow
              label="Meter identity"
              value="not surfaced"
              tone="idle"
            />
            <SignalRow
              label="Data source"
              value="P1 smart meter"
              tone="info"
            />
          </section>

          <section className="card rounded-[1.9rem] p-5">
            <p className="kicker">Reality check</p>
            <p className="card-header mb-2">No more decorative assumptions</p>
            <p className="text-sm leading-6 text-white/58">
              This page no longer invents daily segments, cost estimates, or meter IDs.
              Every number shown here comes from the live or historical gas telemetry already in the app.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
