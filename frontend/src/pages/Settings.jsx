import { useRuntimeSettings } from "../hooks/useRuntimeSettings";
import { useState } from "react";

export default function Settings() {
  const {
    settings,
    setSettings,
    loading: settingsLoading,
    saving: settingsSaving,
    testing: settingsTesting,
    message: settingsMessage,
    save,
    testConnection,
  } = useRuntimeSettings();

  const [expandedDevice, setExpandedDevice] = useState("slimmelezer");

  const hasSmartMeter = Boolean(settings?.smartMeterBaseUrl?.trim());
  const hasSma = Boolean(settings?.smaInverterBaseUrl?.trim());
  const hasEnphase = Boolean(settings?.enphaseInverterBaseUrl?.trim());

  const onSettingChange = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  const onSaveSettings = async (e) => {
    e.preventDefault();
    await save(settings);
  };

  const onTestConnection = async () => {
    await testConnection();
  };

  if (settingsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-600 mt-2">Configure your devices</p>
        </div>
        <div className="card">
          <p className="text-slate-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600 mt-2">
          Configure your energy devices and integrations
        </p>
      </div>

      <form onSubmit={onSaveSettings} className="space-y-6">
        {/* Smart Meter Section */}
        <div className="card border-2 border-blue-200">
          <div
            className="flex justify-between items-center cursor-pointer"
            onClick={() =>
              setExpandedDevice(
                expandedDevice === "slimmelezer" ? null : "slimmelezer",
              )
            }>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌊</span>
              <div>
                <p className="card-header m-0">Smart Meter (P1 Listener)</p>
                <p
                  className={`text-sm ${hasSmartMeter ? "text-green-600" : "text-amber-600"}`}>
                  {hasSmartMeter ? "Configured" : "Not configured"}
                </p>
              </div>
            </div>
            <span className="text-2xl">
              {expandedDevice === "slimmelezer" ? "▼" : "▶"}
            </span>
          </div>

          {expandedDevice === "slimmelezer" && (
            <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
              <div>
                <label className="label">Base URL</label>
                <input
                  type="text"
                  className="input"
                  autoComplete="url"
                  value={settings?.smartMeterBaseUrl ?? ""}
                  onChange={(e) =>
                    onSettingChange("smartMeterBaseUrl", e.target.value)
                  }
                  placeholder="http://slimmelezer.local"
                />
                <p className="text-xs text-slate-500 mt-1">
                  ESPHome device address
                </p>
              </div>
            </div>
          )}
        </div>

        {/* SMA Inverter Section */}
        <div className="card border-2 border-yellow-200">
          <div
            className="flex justify-between items-center cursor-pointer"
            onClick={() =>
              setExpandedDevice(expandedDevice === "sma" ? null : "sma")
            }>
            <div className="flex items-center gap-3">
              <span className="text-2xl">☀️</span>
              <div>
                <p className="card-header m-0">SMA Inverter</p>
                <p
                  className={`text-sm ${hasSma ? "text-green-600" : "text-slate-500"}`}>
                  {hasSma ? "Configured" : "Optional"}
                </p>
              </div>
            </div>
            <span className="text-2xl">
              {expandedDevice === "sma" ? "▼" : "▶"}
            </span>
          </div>

          {expandedDevice === "sma" && (
            <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
              <div>
                <label className="label">SMA Base URL</label>
                <input
                  type="text"
                  className="input"
                  autoComplete="url"
                  value={settings?.smaInverterBaseUrl ?? ""}
                  onChange={(e) =>
                    onSettingChange("smaInverterBaseUrl", e.target.value)
                  }
                  placeholder="http://192.168.1.234"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Host/IP or absolute URL. If host only, scheme follows the SSL
                  toggle.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.smaUseSsl)}
                    onChange={(e) =>
                      onSettingChange("smaUseSsl", e.target.checked)
                    }
                  />
                  Use HTTPS
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings?.smaVerifySsl ?? true}
                    onChange={(e) =>
                      onSettingChange("smaVerifySsl", e.target.checked)
                    }
                  />
                  Verify SSL certificate
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Connection Group</label>
                  <select
                    className="input"
                    value={settings?.smaGroup ?? "user"}
                    onChange={(e) =>
                      onSettingChange("smaGroup", e.target.value)
                    }>
                    <option value="user">user</option>
                    <option value="installer">installer</option>
                  </select>
                </div>
                <div>
                  <label className="label">Expected Serial (optional)</label>
                  <input
                    type="text"
                    className="input"
                    value={settings?.smaExpectedSerial ?? ""}
                    onChange={(e) =>
                      onSettingChange("smaExpectedSerial", e.target.value)
                    }
                    placeholder="e.g. 123456789"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Login Right</label>
                  <input
                    type="text"
                    className="input"
                    value={settings?.smaLoginRight ?? "usr"}
                    onChange={(e) =>
                      onSettingChange("smaLoginRight", e.target.value)
                    }
                    placeholder="usr or istl"
                  />
                </div>
                <div>
                  <label className="label">Username</label>
                  <input
                    type="text"
                    className="input"
                    autoComplete="username"
                    value={settings?.smaMeterUsername ?? ""}
                    onChange={(e) =>
                      onSettingChange("smaMeterUsername", e.target.value)
                    }
                    placeholder="installer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    autoComplete="current-password"
                    value={settings?.smaMeterPassword ?? ""}
                    onChange={(e) =>
                      onSettingChange("smaMeterPassword", e.target.value)
                    }
                    placeholder="SMA password"
                  />
                </div>
                <div>
                  <label className="label">PV Power Key</label>
                  <input
                    type="text"
                    className="input"
                    value={settings?.smaPvPowerKey ?? ""}
                    onChange={(e) =>
                      onSettingChange("smaPvPowerKey", e.target.value)
                    }
                    placeholder="6100_40263F00"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Enphase Inverter Section */}
        <div className="card border-2 border-purple-200">
          <div
            className="flex justify-between items-center cursor-pointer"
            onClick={() =>
              setExpandedDevice(expandedDevice === "enphase" ? null : "enphase")
            }>
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <p className="card-header m-0">Enphase Inverter</p>
                <p
                  className={`text-sm ${hasEnphase ? "text-green-600" : "text-slate-500"}`}>
                  {hasEnphase ? "Configured" : "Optional"}
                </p>
              </div>
            </div>
            <span className="text-2xl">
              {expandedDevice === "enphase" ? "▼" : "▶"}
            </span>
          </div>

          {expandedDevice === "enphase" && (
            <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
              <div>
                <label className="label">Enphase Base URL</label>
                <input
                  type="text"
                  className="input"
                  autoComplete="url"
                  value={settings?.enphaseInverterBaseUrl ?? ""}
                  onChange={(e) =>
                    onSettingChange("enphaseInverterBaseUrl", e.target.value)
                  }
                  placeholder="http://192.168.1.xxx"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.enphaseVerifySsl)}
                  onChange={(e) =>
                    onSettingChange("enphaseVerifySsl", e.target.checked)
                  }
                />
                Verify SSL certificate
              </label>
              <p className="text-xs text-slate-500 -mt-2">
                Local Enphase Envoy devices often use self-signed certificates.
                Leave this off if you connect over HTTPS on your LAN.
              </p>

              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  className="input"
                  autoComplete="username"
                  value={settings?.enphaseUsername ?? ""}
                  onChange={(e) =>
                    onSettingChange("enphaseUsername", e.target.value)
                  }
                  placeholder="Enlighten email or local installer username"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Firmware 7+ uses your Enlighten cloud account to obtain and
                  refresh the Envoy token automatically.
                </p>
              </div>

              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  value={settings?.enphasePassword ?? ""}
                  onChange={(e) =>
                    onSettingChange("enphasePassword", e.target.value)
                  }
                  placeholder="Enlighten password or local Envoy password"
                />
                <p className="text-xs text-slate-500 mt-1">
                  This flow is now aligned with the Home Assistant plugin for
                  firmware 7+ devices. Older local-auth Envoy support is still
                  more limited here.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="card bg-slate-50 border-slate-300">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={settingsSaving}
              className="btn-primary disabled:opacity-75">
              {settingsSaving ? "Saving..." : "Save Settings"}
            </button>

            <button
              type="button"
              onClick={onTestConnection}
              disabled={settingsTesting}
              className="btn-secondary disabled:opacity-75">
              {settingsTesting ? "Testing..." : "Test Connection"}
            </button>
          </div>

          {settingsMessage && (
            <p className="text-sm mt-4 p-3 bg-white rounded border border-slate-200">
              {settingsMessage}
            </p>
          )}
        </div>
      </form>

      {/* Device Status Summary */}
      <div className="card bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <p className="card-header">📡 System Status</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-600">Smart Meter</p>
            <p
              className={`font-semibold ${hasSmartMeter ? "text-green-600" : "text-amber-600"}`}>
              {hasSmartMeter ? "Configured" : "Needs setup"}
            </p>
          </div>
          <div>
            <p className="text-slate-600">SMA Inverter</p>
            <p
              className={`font-semibold ${hasSma ? "text-green-600" : "text-slate-500"}`}>
              {hasSma ? "Configured" : "Not configured"}
            </p>
          </div>
          <div>
            <p className="text-slate-600">Enphase Inverter</p>
            <p
              className={`font-semibold ${hasEnphase ? "text-green-600" : "text-slate-500"}`}>
              {hasEnphase ? "Configured" : "Not configured"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
