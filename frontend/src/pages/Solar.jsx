import { MetricCard, SignalRow } from "../components/dashboard/ConsoleUi";
import FlowTrendChart from "../components/dashboard/FlowTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import {
  averageSeriesValue,
  buildCombinedTrendData,
  buildRecentBars,
  maxSeriesValue,
} from "../lib/energyTelemetry";

function formatKwFromWatts(value) {
  return `${(value / 1000).toFixed(1)} kW`;
}

function formatKwh(value) {
  return `${value.toFixed(1)} kWh`;
}

function BreakdownRow({ label, value, subcopy, color }) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-4">
      <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/38">
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-sm text-white/48">{subcopy}</div>
    </div>
  );
}

export default function Solar() {
  const { now, today, history, error } = useEnergyData({ refreshMs: 15000 });
  const summary = today.summary;
  const productionPoints = history?.production ?? [];
  const trendData = buildCombinedTrendData(history);
  const productionBars = buildRecentBars(
    productionPoints,
    6,
    (value) => `${(value / 1000).toFixed(1)} kW`,
  );

  const currentProductionW = now?.solarProductionW ?? 0;
  const currentProductionKw = currentProductionW / 1000;
  const producedKwh = summary?.producedKwh ?? 0;
  const usedKwh = summary?.usedKwh ?? 0;
  const importedKwh = summary?.importedKwh ?? 0;
  const exportedKwh = summary?.exportedKwh ?? 0;
  const selfPoweredPct = summary?.solarCoveragePct ?? 0;
  const directSolarUse = Math.max(usedKwh - importedKwh, 0);
  const surplusSolar = Math.max(producedKwh - directSolarUse, 0);
  const averageProductionKw = averageSeriesValue(productionPoints) / 1000;
  const peakProductionKw = maxSeriesValue(productionPoints) / 1000;
  const aggregateLive = currentProductionW > 30 || productionPoints.length > 0;

  return (
    <div className="page-wrap">
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div
          className="absolute inset-0 opacity-80"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(251,191,36,0.18), transparent 25%), radial-gradient(circle at 85% 20%, rgba(16,185,129,0.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
          }}
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="hero-kicker">Solar desk</p>
            <h1 className="page-title max-w-3xl">
              A cleaner solar page with live output, trend context, and fewer made-up claims.
            </h1>
            <p className="page-subtitle max-w-2xl">
              This screen now shows the aggregate solar feed honestly. Per-inverter
              breakdowns stay clearly marked as not yet surfaced by the API.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Live solar
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatKwFromWatts(currentProductionW)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Produced today
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatKwh(producedKwh)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Self powered
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {selfPoweredPct.toFixed(0)}%
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
            eyebrow="Generation"
            label="Current production"
            value={formatKwFromWatts(currentProductionW)}
            subcopy={
              currentProductionKw > 0.05
                ? "Panels are currently feeding the house."
                : "No meaningful solar output at the moment."
            }
            accent="#fbbf24"
          />
          <MetricCard
            eyebrow="Performance"
            label="Average output"
            value={`${averageProductionKw.toFixed(1)} kW`}
            subcopy="Computed from the visible production history window."
            accent="#10b981"
          />
          <MetricCard
            eyebrow="Peak"
            label="Highest visible sample"
            value={`${peakProductionKw.toFixed(1)} kW`}
            subcopy="Peak within the currently loaded trend window."
            accent="#3b82f6"
          />
        </div>

        <div className="order-1 space-y-4 xl:order-2">
          <section className="card rounded-[2rem]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kicker">Production ribbon</p>
                <p className="card-header mb-1">Solar against home demand</p>
                <p className="text-sm text-white/55">
                  Reserve models the portion of solar production not consumed by the house.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/72">
                {aggregateLive ? "Aggregate solar telemetry live" : "Waiting for solar history"}
              </div>
            </div>
            <FlowTrendChart data={trendData} />
          </section>

          <section className="card rounded-[2rem]">
            <div className="mb-4">
              <p className="kicker">Routing breakdown</p>
              <p className="card-header mb-1">Where today&apos;s generation went</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <BreakdownRow
                label="Direct solar use"
                value={formatKwh(directSolarUse)}
                subcopy="Estimated portion consumed locally."
                color="#fbbf24"
              />
              <BreakdownRow
                label="Surplus solar"
                value={formatKwh(surplusSolar)}
                subcopy="Estimated excess beyond local demand."
                color="#10b981"
              />
              <BreakdownRow
                label="Grid import"
                value={formatKwh(importedKwh)}
                subcopy="Energy still drawn from the grid."
                color="#8b5cf6"
              />
              <BreakdownRow
                label="Grid export"
                value={formatKwh(exportedKwh)}
                subcopy="Energy sent back out of the house."
                color="#3b82f6"
              />
            </div>
          </section>
        </div>

        <div className="order-3 space-y-4">
          <section className="card space-y-3 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Source honesty</p>
              <p className="card-header mb-1">Telemetry status</p>
            </div>
            <SignalRow
              label="Aggregate solar feed"
              value={aggregateLive ? "available" : "waiting"}
              tone={aggregateLive ? "ok" : "idle"}
            />
            <SignalRow
              label="Per-inverter split"
              value="not surfaced"
              tone="idle"
            />
            <SignalRow label="SMA source detail" value="not exposed separately" tone="idle" />
            <SignalRow label="Enphase source detail" value="not exposed separately" tone="idle" />
          </section>

          <section className="card space-y-4 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Recent windows</p>
              <p className="card-header mb-1">Latest production samples</p>
            </div>
            <div className="space-y-3">
              {productionBars.length === 0 && (
                <p className="text-sm text-white/48">
                  No recent solar samples yet.
                </p>
              )}
              {productionBars.map((point) => (
                <div key={point.timestamp} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">{point.label}</span>
                    <span className="font-mono text-white">{point.formattedValue}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/6">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${point.widthPct}%`,
                        background: "#fbbf24",
                        boxShadow: "0 0 16px rgba(251,191,36,0.45)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
