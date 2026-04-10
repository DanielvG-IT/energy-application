import {
  GaugeCard,
  MetricCard,
  MixRow,
  SignalRow,
} from "../components/dashboard/ConsoleUi";
import PageHero from "../components/PageHero";
import SeriesTrendChart from "../components/telemetry/SeriesTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import { buildCombinedTrendData } from "../lib/energyTelemetry";

const SOLAR_SERIES = [
  { key: "solar", label: "Solar", color: "#f5a524" },
  { key: "home", label: "Home", color: "#5ad4ff" },
  { key: "reserve", label: "Reserve", color: "#5ed9b4" },
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

  const solarNow = Math.max(0, now?.solarProductionW ?? 0);
  const homeNow = Math.max(0, now?.netHomeW ?? 0);
  const producedToday = summary?.producedKwh ?? 0;
  const importedToday = summary?.importedKwh ?? 0;
  const exportedToday = summary?.exportedKwh ?? 0;
  const usedToday = summary?.usedKwh ?? 0;
  const coverage = summary?.solarCoveragePct ?? 0;
  const solarUsedKwh = Math.max(usedToday - importedToday, 0);
  const solarExcessKwh = Math.max(producedToday - solarUsedKwh, 0);
  const mixPeak = Math.max(
    producedToday,
    solarUsedKwh,
    solarExcessKwh,
    exportedToday,
    0.1,
  );

  return (
    <div className="page-wrap">
      <PageHero
        eyebrow="Solar desk"
        title="Keep the solar page grounded in what the site actually knows."
        description="This view favors clear site-level truth over fake inverter badges: live production, home demand, self-consumption, and modeled surplus from recent history."
        accent="teal"
        stats={[
          {
            label: "Live solar",
            value: formatKw(solarNow),
            note: "Current site production",
          },
          {
            label: "Produced today",
            value: formatKwh(producedToday),
            note: "Accumulated generation today",
          },
          {
            label: "Site coverage",
            value: `${coverage.toFixed(0)}%`,
            note: "Share of today's usage covered by solar",
          },
        ]}
      />

      {error && <div className="notice-banner warn">{error}</div>}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card rounded-[2.2rem]">
            <div className="mb-4">
              <p className="kicker">Trend ribbon</p>
              <p className="card-header mb-1">Solar against home demand</p>
              <p className="text-sm text-white/55">
                Reserve is modeled as solar surplus after the house load.
              </p>
            </div>
            <SeriesTrendChart
              data={trendData}
              series={SOLAR_SERIES}
              unit="kW"
              summaryLabel="Selected hour"
              emptyMessage="Waiting for enough history to chart the solar profile."
            />
          </section>

          <section className="card space-y-4 rounded-[2.2rem] p-5">
            <div>
              <p className="kicker">Daily split</p>
              <p className="card-header mb-1">Where the solar went today</p>
            </div>
            <MixRow
              label="Used on site"
              value={formatKwh(solarUsedKwh)}
              percent={(solarUsedKwh / mixPeak) * 100}
              color="#5ed9b4"
            />
            <MixRow
              label="Generated total"
              value={formatKwh(producedToday)}
              percent={(producedToday / mixPeak) * 100}
              color="#f5a524"
            />
            <MixRow
              label="Sent to grid"
              value={formatKwh(exportedToday)}
              percent={(exportedToday / mixPeak) * 100}
              color="#ff7a59"
            />
            <MixRow
              label="Excess potential"
              value={formatKwh(solarExcessKwh)}
              percent={(solarExcessKwh / mixPeak) * 100}
              color="#5ad4ff"
            />
          </section>
        </div>

        <div className="space-y-4">
          <MetricCard
            eyebrow="Generation"
            label="Current site production"
            value={formatKw(solarNow)}
            subcopy={
              solarNow > 0
                ? "Panels are actively feeding the house."
                : "Solar is idle right now."
            }
            accent="#f5a524"
          />
          <MetricCard
            eyebrow="Demand"
            label="Current home draw"
            value={formatKw(homeNow)}
            subcopy="Shown here so production can be read in context."
            accent="#5ad4ff"
          />
          <GaugeCard
            percent={coverage}
            label="Self powered"
            detail={`${formatKwh(producedToday)} produced against ${formatKwh(usedToday)} used.`}
            color="#5ed9b4"
          />

          <div className="card space-y-3 rounded-[2rem] p-5">
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
