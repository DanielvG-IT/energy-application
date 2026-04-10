const HERO_THEMES = {
  amber: {
    accent: "#f5a524",
    glow: "rgba(245, 165, 36, 0.28)",
    haze: "rgba(245, 165, 36, 0.12)",
  },
  cyan: {
    accent: "#5ad4ff",
    glow: "rgba(90, 212, 255, 0.28)",
    haze: "rgba(90, 212, 255, 0.12)",
  },
  teal: {
    accent: "#5ed9b4",
    glow: "rgba(94, 217, 180, 0.28)",
    haze: "rgba(94, 217, 180, 0.12)",
  },
  coral: {
    accent: "#ff7a59",
    glow: "rgba(255, 122, 89, 0.28)",
    haze: "rgba(255, 122, 89, 0.12)",
  },
};

export default function PageHero({
  eyebrow,
  title,
  description,
  accent = "amber",
  stats = [],
}) {
  const theme = HERO_THEMES[accent] ?? HERO_THEMES.amber;

  return (
    <section
      className="page-hero"
      style={{
        "--hero-accent": theme.accent,
        "--hero-glow": theme.glow,
        "--hero-haze": theme.haze,
      }}>
      <div className="page-hero-grid">
        <div className="page-hero-copy">
          <p className="hero-kicker">{eyebrow}</p>
          <h1 className="page-title max-w-4xl">{title}</h1>
          <p className="page-subtitle">{description}</p>
        </div>

        {stats.length > 0 && (
          <div className="page-hero-stats">
            {stats.map((stat) => (
              <div key={stat.label} className="page-hero-stat">
                <div className="page-stat-label">{stat.label}</div>
                <div className="page-stat-value">{stat.value}</div>
                {stat.note ? <p className="page-stat-note">{stat.note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
