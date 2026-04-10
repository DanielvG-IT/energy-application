import { useEffect, useState } from "react";
import {
  GaugeCard,
  MetricCard,
  MixRow,
  SignalRow,
} from "../components/dashboard/ConsoleUi";
import FlowTrendChart from "../components/dashboard/FlowTrendChart";
import LiveEnergyScene from "../components/dashboard/LiveEnergyScene";
import PageHero from "../components/PageHero";
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

  const solarKw = Math.max(0, now?.solarProductionW ?? 0);
  const homeKw = Math.max(0, now?.netHomeW ?? 0);
  const gridNetKw = now?.netGridW ?? 0;
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

  const mixPeak = Math.max(
    usedToday,
    producedToday,
    importedToday,
    exportedToday,
    0.1,
  );

  return (
    <div className="page-wrap">
      <PageHero
        eyebrow="Live command deck"
        title="Read the whole house in one glance instead of chasing five disconnected widgets."
        description="Solar production, home demand, grid exchange, and gas flow share one clear frame. Battery and EV lanes stay visible, but honest, until those telemetry feeds exist."
        accent="amber"
        stats={[
          {
            label: "Local time",
            value: clock.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            note: "Live system clock",
          },
          {
            label: "Grid state",
            value: gridImport
              ? `IN ${formatCompactPower(gridImportKw)}`
              : gridExport
                ? `OUT ${formatCompactPower(gridExportKw)}`
                : "BALANCED",
            note: gridImport
              ? "Utility is supporting the house"
              : gridExport
                ? "Surplus is heading back to the grid"
                : "Import and export are near zero",
          },
          {
            label: "Solar today",
            value: formatKwh(producedToday),
            note: `${solarCoverage.toFixed(0)}% of today's usage covered`,
          },
        ]}
      />

      {error && <div className="notice-banner warn">{error}</div>}

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <MetricCard
            eyebrow="Generation"
            label="Live solar"
            value={formatPower(solarKw)}
            subcopy={
              solarKw > 0
                ? "Panels are actively feeding the site."
                : "No active solar generation right now."
            }
            accent="#f5a524"
          />
          <MetricCard
            eyebrow="Demand"
            label="Home load"
            value={formatPower(homeKw)}
            subcopy={`${formatKwh(usedToday)} used so far today.`}
            accent="#5ad4ff"
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
            accent={gridImport ? "#ff7a59" : "#5ed9b4"}
          />
          <MetricCard
            eyebrow="Gas"
            label="Current flow"
            value={formatGas(gasFlow)}
            subcopy={`${gasToday.toFixed(2)} m3 logged today.`}
            accent="#4fd1e5"
          />

          <div className="card space-y-3 rounded-[2rem] p-5">
            <div>
              <p className="kicker">Signal lanes</p>
              <p className="card-header mb-1">Current telemetry posture</p>
            </div>
            <SignalRow
              label="Solar feed"
              value={solarKw > 0 ? "active" : "idle"}
              tone={solarKw > 0 ? "ok" : "idle"}
            />
            <SignalRow
              label="Grid exchange"
              value={gridImport ? "import" : gridExport ? "export" : "balanced"}
              tone={gridImport ? "warn" : gridExport ? "ok" : "info"}
            />
            <SignalRow
              label="Battery rail"
              value={batteryLinked ? "linked" : "standby"}
            />
            <SignalRow
              label="EV charger"
              value={evLinked ? "linked" : "standby"}
            />
          </div>
        </div>

        <div className="space-y-4">
          <section className="card overflow-hidden rounded-[2.3rem] p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
              <div>
                <p className="kicker">Live scene</p>
                <p className="card-header mb-1">Power motion across the site</p>
                <p className="text-sm text-white/55">
                  The illustrated scene moves with solar, grid, and home demand
                  in real time.
                </p>
              </div>
              <div className="badge">
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
              <div className="rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                  Battery lane
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  Standby until storage telemetry is connected
                </div>
                <div className="mt-1 text-sm text-white/48">
                  The deck keeps the storage lane visible without inventing
                  battery values.
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-white/40">
                  EV lane
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  Charger visuals are parked in standby
                </div>
                <div className="mt-1 text-sm text-white/48">
                  Charging animation only wakes up when an actual charger feed
                  exists.
                </div>
              </div>
            </div>
          </section>

          <section className="card rounded-[2.2rem]">
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
                  <span className="h-1.5 w-4 rounded-full bg-[#f5a524]" />
                  Solar
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-4 rounded-full bg-[#ff7a59]" />
                  Grid
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-4 rounded-full bg-[#5ad4ff]" />
                  Home
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-4 rounded-full bg-[#5ed9b4]" />
                  Reserve
                </span>
              </div>
            </div>
            <FlowTrendChart data={trendData} />
          </section>
        </div>

        <div className="space-y-4">
          <GaugeCard
            percent={solarCoverage}
            label="Self powered"
            detail={`${formatKwh(producedToday)} produced against ${formatKwh(usedToday)} used.`}
          />

          <div className="card space-y-4 rounded-[2rem] p-5">
            <div>
              <p className="kicker">Energy split</p>
              <p className="card-header mb-1">Today at a glance</p>
            </div>
            <MixRow
              label="Home usage"
              value={formatKwh(usedToday)}
              percent={(usedToday / mixPeak) * 100}
              color="#5ad4ff"
            />
            <MixRow
              label="Solar production"
              value={formatKwh(producedToday)}
              percent={(producedToday / mixPeak) * 100}
              color="#f5a524"
            />
            <MixRow
              label="Grid imported"
              value={formatKwh(importedToday)}
              percent={(importedToday / mixPeak) * 100}
              color="#ff7a59"
            />
            <MixRow
              label="Grid exported"
              value={formatKwh(exportedToday)}
              percent={(exportedToday / mixPeak) * 100}
              color="#5ed9b4"
            />
          </div>

          <div className="card space-y-3 rounded-[2rem] p-5">
            <div>
              <p className="kicker">Operational notes</p>
              <p className="card-header mb-1">How the system is behaving</p>
            </div>
            <SignalRow
              label="Live feed"
              value={now ? "streaming" : "waiting"}
              tone={now ? "ok" : "idle"}
            />
            <SignalRow
              label="History trend"
              value={
                trendData.length > 0 ? `${trendData.length} points` : "warming up"
              }
              tone={trendData.length > 0 ? "info" : "idle"}
            />
            <SignalRow
              label="Gas today"
              value={`${gasToday.toFixed(2)} m3`}
              tone="info"
            />
            <SignalRow label="Battery telemetry" value="not wired" tone="idle" />
            <SignalRow label="EV telemetry" value="not wired" tone="idle" />
          </div>
        </div>
      </section>
    </div>
  );
}
