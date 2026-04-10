import { MetricCard, SignalRow } from "../components/dashboard/ConsoleUi";
import PageHero from "../components/PageHero";
import SeriesTrendChart from "../components/telemetry/SeriesTrendChart";
import { useEnergyData } from "../hooks/useEnergyData";
import {
  averageSeriesValue,
  buildGasTrendData,
  buildRecentBars,
  maxSeriesValue,
} from "../lib/energyTelemetry";

const GAS_SERIES = [{ key: "gas", label: "Gas flow", color: "#4fd1e5" }];

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
      <PageHero
        eyebrow="Gas desk"
        title="Give gas the same level of care as power instead of leaving it as placeholder content."
        description="Current flow, today's accumulated usage, and the recent cadence all come from the same telemetry stream as the rest of the app, but with their own unit and pacing."
        accent="cyan"
        stats={[
          {
            label: "Live flow",
            value: formatGas(gasFlow),
            note: "Current gas-flow rate",
          },
          {
            label: "Used today",
            value: `${gasToday.toFixed(2)} m3`,
            note: "Accumulated usage today",
          },
          {
            label: "Peak recent",
            value: formatGas(peakGas),
            note: "Highest recent gas-flow sample",
          },
        ]}
      />

      {error && <div className="notice-banner warn">{error}</div>}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card rounded-[2.2rem]">
            <div className="mb-4">
              <p className="kicker">Flow ribbon</p>
              <p className="card-header mb-1">Recent gas cadence</p>
              <p className="text-sm text-white/55">
                The chart shows live gas-flow samples over the latest captured
                windows.
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

          <section className="card space-y-3 rounded-[2.2rem] p-5">
            <div>
              <p className="kicker">Recent pulses</p>
              <p className="card-header mb-1">Latest meter snapshots</p>
            </div>
            {recentBars.length === 0 && (
              <p className="text-sm text-white/55">No recent gas samples yet.</p>
            )}
            {recentBars.map((point) => (
              <div key={point.timestamp} className="space-y-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-mono text-white/80">{point.label}</span>
                  <span className="font-mono text-white">
                    {point.formattedValue}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/6">
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: `${point.widthPct}%`,
                      background: "#4fd1e5",
                      boxShadow: "0 0 14px rgba(79, 209, 229, 0.45)",
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="space-y-4">
          <MetricCard
            eyebrow="Live"
            label="Current flow"
            value={formatGas(gasFlow)}
            subcopy="This is the current gas-flow rate from the meter feed."
            accent="#4fd1e5"
          />
          <MetricCard
            eyebrow="Daily"
            label="Used today"
            value={`${gasToday.toFixed(2)} m3`}
            subcopy="Accumulated gas usage across the current day."
            accent="#5ad4ff"
          />
          <MetricCard
            eyebrow="Average"
            label="Rolling mean"
            value={formatGas(avgGas)}
            subcopy="Average recent gas-flow reading across the history window."
            accent="#5ed9b4"
          />

          <div className="card space-y-3 rounded-[2rem] p-5">
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
