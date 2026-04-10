import {
  GaugeCard,
  MetricCard,
  SignalRow,
} from "../components/dashboard/ConsoleUi";
import FlowTrendChart from "../components/dashboard/FlowTrendChart";
import PageHero from "../components/PageHero";
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

const GAS_SERIES = [{ key: "gas", label: "Gas flow", color: "#4fd1e5" }];

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

  const avgHome = averageSeriesValue(history?.consumption);
  const avgSolar = averageSeriesValue(history?.production);
  const avgGas = averageSeriesValue(history?.gas);
  const peakHome = maxSeriesValue(history?.consumption);
  const lastConsumption = lastSeriesPoint(history?.consumption);
  const lastProduction = lastSeriesPoint(history?.production);
  const lastGas = lastSeriesPoint(history?.gas);
  const solarCoverage = summary?.solarCoveragePct ?? 0;

  return (
    <div className="page-wrap">
      <PageHero
        eyebrow="Historical view"
        title="Turn the last few hours into one readable story for power, solar, and gas."
        description="History keeps the same visual language as the live deck: one ribbon for household power, one for gas cadence, and a compact side rail for the patterns that matter first."
        accent="cyan"
        stats={[
          {
            label: "Avg home",
            value: formatKw(avgHome),
            note: "Rolling average consumption",
          },
          {
            label: "Avg solar",
            value: formatKw(avgSolar),
            note: "Recent production baseline",
          },
          {
            label: "Avg gas",
            value: formatGas(avgGas),
            note: "Recent gas-flow mean",
          },
        ]}
      />

      {error && <div className="notice-banner warn">{error}</div>}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card rounded-[2.2rem]">
            <div className="mb-4">
              <p className="kicker">Power history</p>
              <p className="card-header mb-1">Recent household profile</p>
              <p className="text-sm text-white/55">
                Solar, grid, home, and modeled reserve share one timeline.
              </p>
            </div>
            <FlowTrendChart data={powerTrend} />
          </section>

          <section className="card rounded-[2.2rem]">
            <div className="mb-4">
              <p className="kicker">Gas history</p>
              <p className="card-header mb-1">Recent gas rhythm</p>
              <p className="text-sm text-white/55">
                Gas stays separate from power so the units remain clean and
                readable.
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

        <div className="space-y-4">
          <MetricCard
            eyebrow="Average"
            label="Home draw"
            value={formatKw(avgHome)}
            subcopy="Average home demand across the history window."
            accent="#5ad4ff"
          />
          <MetricCard
            eyebrow="Peak"
            label="Highest recent home draw"
            value={formatKw(peakHome)}
            subcopy="Useful for spotting spikes before diving into raw data."
            accent="#f5a524"
          />
          <GaugeCard
            percent={solarCoverage}
            label="Today coverage"
            detail={`${solarCoverage.toFixed(0)}% of today's usage covered by solar.`}
            color="#5ed9b4"
          />

          <div className="card space-y-3 rounded-[2rem] p-5">
            <div>
              <p className="kicker">Latest samples</p>
              <p className="card-header mb-1">Most recent captured points</p>
            </div>
            <SignalRow
              label="Consumption"
              value={
                lastConsumption
                  ? formatPointTimestamp(lastConsumption.timestamp)
                  : "none yet"
              }
              tone={lastConsumption ? "info" : "idle"}
            />
            <SignalRow
              label="Production"
              value={
                lastProduction
                  ? formatPointTimestamp(lastProduction.timestamp)
                  : "none yet"
              }
              tone={lastProduction ? "ok" : "idle"}
            />
            <SignalRow
              label="Gas"
              value={lastGas ? formatPointTimestamp(lastGas.timestamp) : "none yet"}
              tone={lastGas ? "info" : "idle"}
            />
            <SignalRow
              label="History density"
              value={
                history?.consumption?.length
                  ? `${history.consumption.length} power points`
                  : "warming up"
              }
              tone={history?.consumption?.length ? "info" : "idle"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
