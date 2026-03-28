import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

const DEFAULT_SETTINGS = {
  pollingSeconds: 10,
  smartMeterBaseUrl: "",
  smaInverterBaseUrl: "",
  smaUseSsl: false,
  smaVerifySsl: true,
  smaGroup: "user",
  smaExpectedSerial: "",
  enphaseInverterBaseUrl: "",
  enphaseVerifySsl: false,
  enphaseUsername: "",
  enphasePassword: "",
  smaMeterUsername: "installer",
  smaMeterPassword: "installer",
  smaLoginRight: "usr",
  smaPvPowerKey: "6100_40263F00",
  enphaseSessionId: "",
};

export function useRuntimeSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/settings`);
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        if (!active) return;
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      } catch {
        if (!active) return;
        setMessage(
          "Could not load settings from backend. You can still edit values and save once the API is available.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function save(nextSettings) {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextSettings),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setSettings(updated);
      setMessage("✓ Settings saved successfully!");
    } catch {
      setMessage("✗ Saving failed. Please check API availability and values.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/settings/test`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to test");
      const result = await res.json();
      if (result.ok) {
        setMessage("✓ Connection test passed for all devices!");
      } else {
        const meterInfo = result.smartMeter?.ok
          ? "meter ok"
          : `meter failed: ${result.smartMeter?.error ?? "unknown"}`;
        const inverterInfo = result.inverter?.ok
          ? "inverter ok"
          : `inverter failed: ${result.inverter?.error ?? "unknown"}`;
        setMessage(`⚠ Partial failure: ${meterInfo}; ${inverterInfo}`);
      }
    } catch {
      setMessage("✗ Connection test failed. Backend may be unavailable.");
    } finally {
      setTesting(false);
    }
  }

  return {
    settings,
    setSettings,
    loading,
    saving,
    testing,
    message,
    save,
    testConnection,
  };
}
