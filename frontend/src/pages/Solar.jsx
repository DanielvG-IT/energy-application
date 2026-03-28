import {
  GaugeCard,
  MetricCard,
  MixRow,
  SignalRow,
} from "../components/dashboard/ConsoleUi";
import SeriesTrendChart from "../components/telemetry/SeriesTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import { buildCombinedTrendData } from "../lib/energyTelemetry";

const SOLAR_SERIES = [
  { key: "solar", label: "Solar", color: "#fbbf24" },
  { key: "home", label: "Home", color: "#3b82f6" },
  { key: "reserve", label: "Reserve", color: "#10b981" },
];

function formatKw(value) {
  return `${value.toFixed(1)} kW`;
}

function formatKwh(value) {
  return `${value.toFixed(1)} kWh`;
}

export default function Solar() {
  const { now, today, history, error } = useEnergyData({ refreshMs: 30000 });
  const summary = today.summary;
  const trendData = buildCombinedTrendData(history);

  const solarNow = Math.max(0, (now?.solarProductionW ?? 0) / 1000);
  const homeNow = Math.max(0, (now?.netHomeW ?? 0) / 1000);
  const producedToday = summary?.producedKwh ?? 0;
  const importedToday = summary?.importedKwh ?? 0;
  const exportedToday = summary?.exportedKwh ?? 0;
  const usedToday = summary?.usedKwh ?? 0;
  const coverage = summary?.solarCoveragePct ?? 0;
  const solarUsedKwh = Math.max(usedToday - importedToday, 0);
  const solarExcessKwh = Math.max(producedToday - solarUsedKwh, 0);
  const mixPeak = Math.max(producedToday, solarUsedKwh, solarExcessKwh, exportedToday, 0.1);

  return (
    <div className="page-wrap">
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div
          className="absolute inset-0 opacity-80"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(251,191,36,0.18), transparent 24%), radial-gradient(circle at 85% 15%, rgba(16,185,129,0.14), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
          }}
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="hero-kicker">Solar console</p>
            <h1 className="page-title max-w-3xl">
              A cleaner production view with site-level truth instead of fake inverter badges.
            </h1>
            <p className="page-subtitle max-w-2xl">
              This page stays grounded in the data you actually have: live solar output,
              home demand, and modeled reserve from recent history.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Live solar
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatKw(solarNow)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Produced today
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatKwh(producedToday)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Site coverage
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {coverage.toFixed(0)}%
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
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kicker">Trend ribbon</p>
                <p className="card-header mb-1">Solar against home demand</p>
                <p className="text-sm text-white/55">
                  Reserve is modeled as solar surplus after the house load.
                </p>
              </div>
            </div>
            <SeriesTrendChart
              data={trendData}
              series={SOLAR_SERIES}
              unit="kW"
              summaryLabel="Selected hour"
              emptyMessage="Waiting for enough history to chart the solar profile."
            />
          </section>

          <section className="card space-y-4 rounded-[2rem] p-5">
            <div>
              <p className="kicker">Daily split</p>
              <p className="card-header mb-1">Where the solar went today</p>
            </div>
            <MixRow
              label="Used on site"
              value={formatKwh(solarUsedKwh)}
              percent={(solarUsedKwh / mixPeak) * 100}
              color="#10b981"
            />
            <MixRow
              label="Generated total"
              value={formatKwh(producedToday)}
              percent={(producedToday / mixPeak) * 100}
              color="#fbbf24"
            />
            <MixRow
              label="Sent to grid"
              value={formatKwh(exportedToday)}
              percent={(exportedToday / mixPeak) * 100}
              color="#8b5cf6"
            />
            <MixRow
              label="Excess potential"
              value={formatKwh(solarExcessKwh)}
              percent={(solarExcessKwh / mixPeak) * 100}
              color="#22c55e"
            />
          </section>
        </div>

        <div className="order-2 space-y-4">
          <MetricCard
            eyebrow="Generation"
            label="Current site production"
            value={formatKw(solarNow)}
            subcopy={solarNow > 0 ? "Panels are actively feeding the house." : "Solar is idle right now."}
            accent="#fbbf24"
          />
          <MetricCard
            eyebrow="Demand"
            label="Current home draw"
            value={formatKw(homeNow)}
            subcopy="Shown here so production can be read in context."
            accent="#3b82f6"
          />
          <GaugeCard
            percent={coverage}
            label="Self powered"
            detail={`${formatKwh(producedToday)} produced against ${formatKwh(usedToday)} used.`}
            color="#fbbf24"
          />

          <div className="card space-y-3 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Source honesty</p>
              <p className="card-header mb-1">What this page really knows</p>
            </div>
            <SignalRow
              label="Site solar telemetry"
              value={now ? "streaming" : "waiting"}
              tone={now ? "ok" : "idle"}
            />
            <SignalRow
              label="SMA per-device status"
              value="not surfaced"
              tone="idle"
            />
            <SignalRow
              label="Enphase per-device status"
              value="not surfaced"
              tone="idle"
            />
            <SignalRow
              label="Reserve number"
              value="modeled from surplus"
              tone="info"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
