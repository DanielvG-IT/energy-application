import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function useEnergyData(options = {}) {
  const {
    includeNow = true,
    includeToday = true,
    includeHistory = true,
    refreshMs = 10000,
  } = options;
  const [now, setNow] = useState(null);
  const [today, setToday] = useState({ summary: null, insights: [] });
  const [history, setHistory] = useState({
    consumption: [],
    production: [],
    gas: [],
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function pull() {
      try {
        const requests = [];

        if (includeNow) {
          requests.push(
            fetch(`${API_BASE}/now`).then(async (res) => {
              if (!active) return;

              if (res.status === 204) {
                setNow(null);
                return;
              }

              setNow(await res.json());
            }),
          );
        }

        if (includeToday) {
          requests.push(
            fetch(`${API_BASE}/today`).then(async (res) => {
              if (!active) return;
              setToday(await res.json());
            }),
          );
        }

        if (includeHistory) {
          requests.push(
            fetch(`${API_BASE}/history?window=day`).then(async (res) => {
              if (!active) return;
              setHistory(await res.json());
            }),
          );
        }

        await Promise.all(requests);

        if (!active) return;
        setError("");
      } catch (e) {
        setError(
          "Live API not reachable. Showing placeholder behavior until backend is running.",
        );
      }
    }

    pull();
    const id = setInterval(pull, refreshMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [includeHistory, includeNow, includeToday, refreshMs]);

  return { now, today, history, error };
}
