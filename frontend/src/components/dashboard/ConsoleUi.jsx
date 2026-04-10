const TONE_COLORS = {
  ok: "#5ed9b4",
  warn: "#f5a524",
  info: "#5ad4ff",
  idle: "#58657c",
};

export function MetricCard({ eyebrow, label, value, subcopy, accent }) {
  return (
    <div
      className="metric-card"
      style={{
        "--metric-accent": accent,
        background: `radial-gradient(circle at top right, ${accent}22, transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)), rgba(10, 15, 24, 0.92)`,
        borderColor: `${accent}35`,
      }}>
      <div className="metric-card-top">
        <div>
          <div className="kicker">{eyebrow}</div>
          <div className="mt-3 text-sm font-medium text-white/72">{label}</div>
        </div>
        <span
          className="metric-card-glow"
          style={{
            background: `${accent}1f`,
            boxShadow: `inset 0 0 0 1px ${accent}30`,
          }}
        />
      </div>
      <div className="metric-card-value">{value}</div>
      <div className="metric-card-note">{subcopy}</div>
    </div>
  );
}

export function SignalRow({ label, value, tone = "idle" }) {
  const color = TONE_COLORS[tone] ?? TONE_COLORS.idle;

  return (
    <div className="signal-row">
      <div className="flex items-center gap-3">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 14px ${color}`,
          }}
        />
        <span className="text-sm text-white/72">{label}</span>
      </div>
      <span className="font-mono text-sm text-white/92">{value}</span>
    </div>
  );
}

export function GaugeCard({ percent, label, detail, color = "#f5a524" }) {
  const size = 154;
  const radius = size * 0.37;
  const circumference = 2 * Math.PI * radius;
  const arc = (Math.max(percent, 0) / 100) * circumference * 0.75;
  const dashOffset = circumference * 0.125;

  return (
    <div
      className="card flex flex-col items-center rounded-[2rem] p-6 text-center"
      style={{
        background: `radial-gradient(circle at top, ${color}20, transparent 36%), linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)), rgba(10, 15, 24, 0.94)`,
      }}>
      <div className="kicker">{label}</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mt-4">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={size * 0.09}
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.09}
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2 - 3}
          textAnchor="middle"
          fill="white"
          fontSize={size * 0.21}
          fontWeight={800}
          fontFamily="monospace">
          {Math.round(percent)}
        </text>
        <text
          x={size / 2}
          y={size / 2 + size * 0.14}
          textAnchor="middle"
          fill="rgba(255,255,255,0.38)"
          fontSize={size * 0.1}
          fontFamily="monospace">
          %
        </text>
      </svg>
      <div className="mt-2 text-sm font-medium text-white/68">{detail}</div>
    </div>
  );
}

export function MixRow({ label, value, percent, color }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-white/58">{label}</span>
        <span className="font-mono text-white">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-white/6">
        <div
          className="h-2.5 rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(percent, 0)}%`,
            background: color,
            boxShadow: `0 0 16px ${color}55`,
          }}
        />
      </div>
    </div>
  );
}
