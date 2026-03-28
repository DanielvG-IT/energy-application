import { useEffect, useState } from "react";
import {
  GaugeCard,
  MetricCard,
  MixRow,
  SignalRow,
} from "../components/dashboard/ConsoleUi";
import LiveEnergyScene from "../components/dashboard/LiveEnergyScene";
import FlowTrendChart from "../components/dashboard/FlowTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import { buildCombinedTrendData } from "../lib/energyTelemetry";
import {
  formatCompactPower,
  formatPower,
  GRID_ACTIVITY_THRESHOLD_KW,
  SOLAR_ACTIVITY_THRESHOLD_KW,
} from "../lib/powerFormatting";

function formatKwh(value) {
  return `${value.toFixed(1)} kWh`;
}

function formatGas(value) {
  return `${value.toFixed(3)} m3/h`;
}

export default function Dashboard() {
  const live = useEnergyData({ includeHistory: false, refreshMs: 10000 });
  const trend = useEnergyData({
    includeNow: false,
    includeToday: false,
    refreshMs: 60000,
  });
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const now = live.now;
  const summary = live.today.summary;
  const error = live.error || trend.error;
  const trendData = buildCombinedTrendData(trend.history);

  const solarKw = Math.max(0, (now?.solarProductionW ?? 0) / 1000);
  const homeKw = Math.max(0, (now?.netHomeW ?? 0) / 1000);
  const gridNetKw = (now?.netGridW ?? 0) / 1000;
  const gridImport = gridNetKw > GRID_ACTIVITY_THRESHOLD_KW;
  const gridExport = gridNetKw < -GRID_ACTIVITY_THRESHOLD_KW;
  const gridImportKw = gridImport ? gridNetKw : 0;
  const gridExportKw = gridExport ? Math.abs(gridNetKw) : 0;
  const usedToday = summary?.usedKwh ?? 0;
  const producedToday = summary?.producedKwh ?? 0;
  const importedToday = summary?.importedKwh ?? 0;
  const exportedToday = summary?.exportedKwh ?? 0;
  const solarCoverage = summary?.solarCoveragePct ?? 0;
  const gasFlow = now?.gasFlowM3h ?? 0;
  const gasToday = summary?.gasM3 ?? 0;
  const batteryLinked = false;
  const evLinked = false;

  const mixPeak = Math.max(usedToday, producedToday, importedToday, exportedToday, 0.1);

  return (
    <div className="page-wrap">
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div
          className="absolute inset-0 opacity-80"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(251,191,36,0.16), transparent 24%), radial-gradient(circle at 85% 15%, rgba(59,130,246,0.14), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
          }}
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="hero-kicker">Energy studio</p>
            <h1 className="page-title max-w-3xl">
              A cinematic control-room view built around your live household flow.
            </h1>
            <p className="page-subtitle max-w-2xl">
              Solar, grid, home demand, and daily trends are live. Battery and EV
              lanes stay in standby until those telemetry sources are wired in.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Local time
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {clock.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Grid state
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {gridImport
                  ? `IN ${formatCompactPower(gridImportKw)}`
                  : gridExport
                    ? `OUT ${formatCompactPower(gridExportKw)}`
                    : "BALANCED"}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                Solar today
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-white">
                {formatKwh(producedToday)}
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

      <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_260px]">
        <div className="order-2 space-y-4 xl:order-1">
          <MetricCard
            eyebrow="Generation"
            label="Live solar"
            value={formatPower(solarKw)}
            subcopy={solarKw > 0 ? "Panels are actively feeding the site." : "No active solar generation right now."}
            accent="#fbbf24"
          />
          <MetricCard
            eyebrow="Demand"
            label="Home load"
            value={formatPower(homeKw)}
            subcopy={`${formatKwh(usedToday)} used so far today.`}
            accent="#3b82f6"
          />
          <MetricCard
            eyebrow="Grid"
            label="Utility exchange"
            value={
              gridImport
                ? formatPower(gridImportKw)
                : gridExport
                  ? formatPower(gridExportKw)
                  : formatPower(0)
            }
            subcopy={
              gridImport
                ? "Importing from the grid."
                : gridExport
                  ? "Exporting surplus back to the grid."
                  : "Grid flow is near zero right now."
            }
            accent={gridImport ? "#8b5cf6" : "#10b981"}
          />
          <MetricCard
            eyebrow="Gas"
            label="Current flow"
            value={formatGas(gasFlow)}
            subcopy={`${gasToday.toFixed(2)} m3 logged today.`}
            accent="#22d3ee"
          />

          <div className="card space-y-3 rounded-[1.7rem] p-5">
            <div className="text-[0.62rem] uppercase tracking-[0.28em] text-white/38">
              Telemetry lanes
            </div>
            <SignalRow label="Solar feed" value={solarKw > 0 ? "active" : "idle"} tone={solarKw > 0 ? "ok" : "idle"} />
            <SignalRow
              label="Grid exchange"
              value={gridImport ? "import" : gridExport ? "export" : "balanced"}
              tone={gridImport ? "warn" : gridExport ? "ok" : "info"}
            />
            <SignalRow label="Battery rail" value={batteryLinked ? "linked" : "standby"} />
            <SignalRow label="EV charger" value={evLinked ? "linked" : "standby"} />
          </div>
        </div>

        <div className="order-1 space-y-4 xl:order-2">
          <section className="card overflow-hidden rounded-[2.2rem] p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
              <div>
                <p className="kicker">Live scene</p>
                <p className="card-header mb-1">Power motion across the site</p>
                <p className="text-sm text-white/55">
                  The illustrated flow updates from live solar, grid, and home demand.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/72">
                {gridImport
                  ? `Grid import ${formatPower(gridImportKw)}`
                  : gridExport
                    ? `Grid export ${formatPower(gridExportKw)}`
                    : "Grid balanced"}
              </div>
            </div>
            <div className="px-2 pb-3 pt-2">
              <LiveEnergyScene
                solarKw={solarKw}
                solarActive={solarKw > SOLAR_ACTIVITY_THRESHOLD_KW}
                gridImportKw={gridImportKw}
                gridExportKw={gridExportKw}
                gridImport={gridImport}
                gridExport={gridExport}
                batteryLinked={batteryLinked}
                batteryPct={0}
                batteryChargeKw={0}
                batteryDischargeKw={0}
                batteryCharging={false}
                batteryDischarging={false}
                evKw={0}
                evLinked={evLinked}
                evCharging={false}
                homeKw={homeKw}
              />
            </div>
            <div className="grid gap-3 border-t border-white/8 px-5 pb-5 pt-3 sm:grid-cols-2">
              <div className="rounded-[1.3rem] border border-white/8 bg-black/20 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                  Battery lane
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  Standby until storage telemetry is connected
                </div>
                <div className="mt-1 text-sm text-white/48">
                  The hardware stays visible in the scene, but the app is not inventing battery values.
                </div>
              </div>
              <div className="rounded-[1.3rem] border border-white/8 bg-black/20 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                  EV lane
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  Charger visuals are parked in standby
                </div>
                <div className="mt-1 text-sm text-white/48">
                  EV charging animation will only wake up once an actual charger feed exists.
                </div>
              </div>
            </div>
          </section>

          <section className="card rounded-[2rem]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kicker">Trend ribbon</p>
                <p className="card-header mb-1">Hourly power profile</p>
                <p className="text-sm text-white/55">
                  Reserve is modeled as solar surplus after home demand.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-[0.68rem] uppercase tracking-[0.18em] text-white/40">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-4 rounded-full bg-[#fbbf24]" />
                  Solar
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-4 rounded-full bg-[#8b5cf6]" />
                  Grid
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-4 rounded-full bg-[#3b82f6]" />
                  Home
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-4 rounded-full bg-[#10b981]" />
                  Reserve
                </span>
              </div>
            </div>
            <FlowTrendChart data={trendData} />
          </section>
        </div>

        <div className="order-3 space-y-4">
          <GaugeCard
            percent={solarCoverage}
            label="Self powered"
            detail={`${formatKwh(producedToday)} produced against ${formatKwh(usedToday)} used.`}
          />

          <div className="card space-y-4 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">Energy mix</p>
              <p className="card-header mb-1">Today at a glance</p>
            </div>
            <MixRow
              label="Home usage"
              value={formatKwh(usedToday)}
              percent={(usedToday / mixPeak) * 100}
              color="#3b82f6"
            />
            <MixRow
              label="Solar production"
              value={formatKwh(producedToday)}
              percent={(producedToday / mixPeak) * 100}
              color="#fbbf24"
            />
            <MixRow
              label="Grid imported"
              value={formatKwh(importedToday)}
              percent={(importedToday / mixPeak) * 100}
              color="#8b5cf6"
            />
            <MixRow
              label="Grid exported"
              value={formatKwh(exportedToday)}
              percent={(exportedToday / mixPeak) * 100}
              color="#10b981"
            />
          </div>

          <div className="card space-y-3 rounded-[1.9rem] p-5">
            <div>
              <p className="kicker">System notes</p>
              <p className="card-header mb-1">Operational context</p>
            </div>
            <SignalRow
              label="Live feed"
              value={now ? "streaming" : "waiting"}
              tone={now ? "ok" : "idle"}
            />
            <SignalRow
              label="History trend"
              value={trendData.length > 0 ? `${trendData.length} points` : "warming up"}
              tone={trendData.length > 0 ? "info" : "idle"}
            />
            <SignalRow
              label="Gas today"
              value={`${gasToday.toFixed(2)} m3`}
              tone="info"
            />
            <SignalRow
              label="Battery telemetry"
              value="not wired"
              tone="idle"
            />
            <SignalRow
              label="EV telemetry"
              value="not wired"
              tone="idle"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
