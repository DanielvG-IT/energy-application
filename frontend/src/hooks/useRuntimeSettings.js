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
  const [testResult, setTestResult] = useState(null);

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
    setTestResult(null);
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
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/settings/test`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to test");
      const result = await res.json();
      setTestResult(result);

      const parts = [];
      parts.push(
        result.smartMeter?.ok
          ? "meter ok"
          : `meter failed: ${result.smartMeter?.error ?? "unknown"}`,
      );

      if (result.sma?.configured) {
        parts.push(
          result.sma.ok ? "SMA ok" : `SMA failed: ${result.sma.error ?? "unknown"}`,
        );
      }

      if (result.enphase?.configured) {
        parts.push(
          result.enphase.ok
            ? "Enphase ok"
            : `Enphase failed: ${result.enphase.error ?? "unknown"}`,
        );
      }

      parts.push(
        result.storage?.ok
          ? "storage ok"
          : `storage failed: ${result.storage?.error ?? "unknown"}`,
      );

      setMessage(`${result.ok ? "✓" : "⚠"} ${parts.join("; ")}`);
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
    testResult,
    save,
    testConnection,
  };
}
