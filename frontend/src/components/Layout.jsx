import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { name: "Dashboard", path: "/" },
  { name: "History", path: "/history" },
  { name: "Solar", path: "/solar" },
  { name: "Gas", path: "/gas" },
  { name: "Settings", path: "/settings" },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const active = NAV_ITEMS.find((item) => item.path === location.pathname);

  return (
    <div className="app-shell md:flex">
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } fixed inset-y-0 left-0 z-40 w-72 energy-sidebar transition-transform duration-300 md:relative md:w-72 md:translate-x-0 flex flex-col overflow-y-auto`}>
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/45">
                Smart Home
              </p>
              <h1 className="text-xl font-bold text-white">Energy Console</h1>
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden rounded-lg border border-white/10 bg-white/5 p-2 text-white transition-colors hover:bg-white/10"
              aria-label="Close navigation">
              X
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`nav-pill ${
                location.pathname === item.path ? "active" : "inactive"
              }`}>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="m-4 rounded-3xl border border-white/10 bg-white/5 p-5 text-xs text-white/60">
          <p className="font-medium text-white">System online</p>
          <p className="mt-2">Live telemetry and device controls</p>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/55 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu overlay"
        />
      )}

      <div className="md:ml-0 min-h-screen flex-1 md:pl-0">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#080b11]/80 px-4 py-3 backdrop-blur md:px-8 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white md:hidden"
                aria-label="Open navigation">
                =
              </button>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/45">
                  Overview
                </p>
                <h2 className="text-lg font-semibold text-white">
                  {active?.name ?? "Energy"}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden md:inline-flex status-chip ok">
                Live feed active
              </span>
            </div>
          </div>
        </header>

        <main className="layout-main">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
