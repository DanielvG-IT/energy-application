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
