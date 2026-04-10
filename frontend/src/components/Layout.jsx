import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  {
    name: "Dashboard",
    path: "/",
    code: "01",
    note: "Live house telemetry",
  },
  {
    name: "History",
    path: "/history",
    code: "02",
    note: "Power and gas trends",
  },
  {
    name: "Solar",
    path: "/solar",
    code: "03",
    note: "Production and self-use",
  },
  {
    name: "Gas",
    path: "/gas",
    code: "04",
    note: "Meter flow and cadence",
  },
  {
    name: "Settings",
    path: "/settings",
    code: "05",
    note: "Device setup and testing",
  },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const location = useLocation();

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const active = useMemo(
    () => NAV_ITEMS.find((item) => item.path === location.pathname) ?? NAV_ITEMS[0],
    [location.pathname],
  );

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(clock),
    [clock],
  );

  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(clock),
    [clock],
  );

  return (
    <div className="app-shell">
      <div className="shell-frame">
        <aside
          className={`energy-sidebar ${
            sidebarOpen ? "translate-x-0" : "-translate-x-[110%] md:translate-x-0"
          }`}>
          <div className="sidebar-brand">
            <div className="flex items-center gap-4">
              <div className="brand-mark">FE</div>
              <div>
                <p className="kicker">Family energy</p>
                <h1 className="text-xl font-semibold text-white">Control deck</h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-white transition-colors hover:bg-white/10 md:hidden"
              aria-label="Close navigation">
              X
            </button>
          </div>

          <div className="brand-panel">
            <p className="kicker">Sharper reads</p>
            <p className="text-base leading-6 text-white/78">
              One visual language for live flow, recent history, and device
              configuration.
            </p>
            <div className="brand-panel-grid">
              <div className="brand-panel-cell">
                <span>Views</span>
                <strong>{NAV_ITEMS.length}</strong>
              </div>
              <div className="brand-panel-cell">
                <span>Mode</span>
                <strong>Live</strong>
              </div>
            </div>
          </div>

          <nav className="nav-stack">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `nav-pill ${isActive ? "active" : "inactive"}`
                }>
                <span className="nav-pill-code">{item.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="nav-pill-label">{item.name}</span>
                  <span className="nav-pill-note">{item.note}</span>
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-note">
            <p className="kicker">Current view</p>
            <p className="mt-2 text-lg font-semibold text-white">{active.name}</p>
            <p className="mt-2 text-sm text-white/55">{active.note}</p>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            className="shell-overlay"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu overlay"
          />
        )}

        <div className="shell-content">
          <header className="shell-header">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg font-semibold text-white transition-colors hover:bg-white/10 md:hidden"
                aria-label="Open navigation">
                =
              </button>

              <div>
                <p className="shell-header-label">Current view</p>
                <h2 className="shell-header-title">{active.name}</h2>
              </div>
            </div>

            <div className="shell-header-meta">
              <div className="shell-header-chip">
                <span>{dateLabel}</span>
                <strong>{timeLabel}</strong>
              </div>
              <span className="status-chip ok">Telemetry-ready</span>
            </div>
          </header>

          <main className="layout-main">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
