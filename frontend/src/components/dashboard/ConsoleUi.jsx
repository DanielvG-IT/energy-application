const TONE_COLORS = {
  ok: "#10b981",
  warn: "#f59e0b",
  info: "#3b82f6",
  idle: "#4b5563",
};

export function MetricCard({ eyebrow, label, value, subcopy, accent }) {
  return (
    <div
      className="card rounded-[1.6rem] p-4"
      style={{
        borderColor: `${accent}30`,
        background: `linear-gradient(180deg, ${accent}12, rgba(8, 12, 20, 0.86)), rgba(8, 12, 20, 0.94)`,
      }}>
      <div className="text-[0.62rem] uppercase tracking-[0.28em] text-white/38">
        {eyebrow}
      </div>
      <div className="mt-3 text-sm font-medium text-white/72">{label}</div>
      <div className="mt-2 font-mono text-[2rem] font-bold text-white">{value}</div>
      <div className="mt-2 text-sm text-white/48">{subcopy}</div>
    </div>
  );
}

export function SignalRow({ label, value, tone = "idle" }) {
  const color = TONE_COLORS[tone] ?? TONE_COLORS.idle;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 12px ${color}`,
          }}
        />
        <span className="text-sm text-white/72">{label}</span>
      </div>
      <span className="font-mono text-sm text-white/90">{value}</span>
    </div>
  );
}

export function GaugeCard({ percent, label, detail, color = "#f59e0b" }) {
  const size = 154;
  const radius = size * 0.37;
  const circumference = 2 * Math.PI * radius;
  const arc = (percent / 100) * circumference * 0.75;
  const dashOffset = circumference * 0.125;

  return (
    <div className="card flex flex-col items-center rounded-[1.9rem] p-6 text-center">
      <div className="text-[0.62rem] uppercase tracking-[0.28em] text-white/38">
        {label}
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mt-4">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1a2235"
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
          fill="#4b5563"
          fontSize={size * 0.1}
          fontFamily="monospace">
          %
        </text>
      </svg>
      <div className="mt-2 text-sm font-medium text-white/70">{detail}</div>
    </div>
  );
}

export function MixRow({ label, value, percent, color }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-white/58">{label}</span>
        <span className="font-mono text-white">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/6">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{
            width: `${percent}%`,
            background: color,
            boxShadow: `0 0 14px ${color}55`,
          }}
        />
      </div>
    </div>
  );
}
