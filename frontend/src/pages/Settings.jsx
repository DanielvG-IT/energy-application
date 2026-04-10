import { useState } from "react";
import PageHero from "../components/PageHero";
import { useRuntimeSettings } from "../hooks/useRuntimeSettings";

function getMessageTone(message) {
  if (!message) {
    return "info";
  }

  if (message.startsWith("✓")) {
    return "ok";
  }

  if (message.startsWith("⚠")) {
    return "warn";
  }

  if (message.startsWith("✗")) {
    return "off";
  }

  return "info";
}

function ConfigPanel({
  code,
  title,
  description,
  configured,
  stateLabel,
  accent,
  expanded,
  onToggle,
  children,
}) {
  return (
    <section className="config-panel">
      <button type="button" className="config-panel-toggle" onClick={onToggle}>
        <div className="flex items-start gap-4 text-left">
          <span
            className="config-panel-code"
            style={{
              color: accent,
              borderColor: `${accent}40`,
              background: `${accent}14`,
            }}>
            {code}
          </span>
          <div>
            <p className="card-header mb-1">{title}</p>
            <p className="text-sm text-white/55">{description}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <span className={`status-chip ${configured ? "ok" : "off"}`}>
            {stateLabel}
          </span>
          <span className="text-[0.68rem] uppercase tracking-[0.24em] text-white/34">
            {expanded ? "Hide" : "Configure"}
          </span>
        </div>
      </button>

      {expanded && <div className="config-panel-body">{children}</div>}
    </section>
  );
}

export default function Settings() {
  const {
    settings,
    setSettings,
    loading: settingsLoading,
    saving: settingsSaving,
    testing: settingsTesting,
    message: settingsMessage,
    testResult,
    save,
    testConnection,
  } = useRuntimeSettings();

  const [expandedDevice, setExpandedDevice] = useState("meter");

  const hasSmartMeter = Boolean(settings?.smartMeterBaseUrl?.trim());
  const hasSma = Boolean(settings?.smaInverterBaseUrl?.trim());
  const hasEnphase = Boolean(settings?.enphaseInverterBaseUrl?.trim());
  const configuredCount = [hasSmartMeter, hasSma, hasEnphase].filter(Boolean).length;
  const diagnosticsLabel = !testResult
    ? "Not run"
    : testResult.ok
      ? "Healthy"
      : "Needs attention";
  const messageTone = getMessageTone(settingsMessage);

  const renderTestState = (configured, result, fallbackLabel) => {
    if (!configured) {
      return "Not configured";
    }

    if (!testResult) {
      return fallbackLabel;
    }

    return result?.ok ? "Test passed" : "Test failed";
  };

  const onSettingChange = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  const onSaveSettings = async (event) => {
    event.preventDefault();
    await save(settings);
  };

  const onTestConnection = async () => {
    await testConnection();
  };

  return (
    <div className="page-wrap">
      <PageHero
        eyebrow="System settings"
        title="Make device setup feel like part of the product instead of a utility form bolted on later."
        description="Configure the smart meter and inverters, tune the collection cadence, then run connection diagnostics without leaving the same visual system as the dashboards."
        accent="coral"
        stats={[
          {
            label: "Configured devices",
            value: `${configuredCount}/3`,
            note: "Meter, SMA, and Enphase endpoints",
          },
          {
            label: "Polling cadence",
            value: `${settings?.pollingSeconds ?? 10}s`,
            note: "Backend refresh interval",
          },
          {
            label: "Diagnostics",
            value: diagnosticsLabel,
            note: "Most recent connection status",
          },
        ]}
      />

      {settingsLoading ? (
        <div className="card rounded-[2.2rem] p-6">
          <p className="card-header mb-2">Loading runtime settings</p>
          <p className="text-sm text-white/60">
            Pulling the current device configuration from the backend.
          </p>
        </div>
      ) : (
        <form onSubmit={onSaveSettings} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="card rounded-[2.2rem] p-5">
              <div className="mb-4">
                <p className="kicker">Collection cadence</p>
                <p className="card-header mb-1">Polling and refresh behavior</p>
                <p className="text-sm text-white/55">
                  Set how often the backend refreshes live telemetry from the
                  configured devices.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <label className="label">Polling interval</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="input"
                    value={settings?.pollingSeconds ?? 10}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      onSettingChange(
                        "pollingSeconds",
                        Number.isNaN(next) ? 0 : next,
                      );
                    }}
                  />
                  <p className="help-text">
                    Seconds between backend collection cycles.
                  </p>
                </div>

                <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.22em] text-white/36">
                    Recommendation
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/68">
                    Keep this interval conservative enough for local devices on
                    your network. Faster polling looks impressive for a few
                    minutes and then creates noise.
                  </p>
                </div>
              </div>
            </section>

            <ConfigPanel
              code="P1"
              title="Smart meter"
              description="Required base endpoint for house demand, grid exchange, and gas flow."
              configured={hasSmartMeter}
              stateLabel={hasSmartMeter ? "Configured" : "Required"}
              accent="#5ad4ff"
              expanded={expandedDevice === "meter"}
              onToggle={() =>
                setExpandedDevice(expandedDevice === "meter" ? null : "meter")
              }>
              <div>
                <label className="label">Base URL</label>
                <input
                  type="text"
                  className="input"
                  autoComplete="url"
                  value={settings?.smartMeterBaseUrl ?? ""}
                  onChange={(event) =>
                    onSettingChange("smartMeterBaseUrl", event.target.value)
                  }
                  placeholder="http://slimmelezer.local"
                />
                <p className="help-text">
                  ESPHome or P1 listener address on your local network.
                </p>
              </div>
            </ConfigPanel>

            <ConfigPanel
              code="SMA"
              title="SMA inverter"
              description="Optional inverter source for direct site production on compatible SMA hardware."
              configured={hasSma}
              stateLabel={hasSma ? "Configured" : "Optional"}
              accent="#f5a524"
              expanded={expandedDevice === "sma"}
              onToggle={() =>
                setExpandedDevice(expandedDevice === "sma" ? null : "sma")
              }>
              <div className="form-grid">
                <div>
                  <label className="label">SMA base URL</label>
                  <input
                    type="text"
                    className="input"
                    autoComplete="url"
                    value={settings?.smaInverterBaseUrl ?? ""}
                    onChange={(event) =>
                      onSettingChange("smaInverterBaseUrl", event.target.value)
                    }
                    placeholder="http://192.168.1.234"
                  />
                  <p className="help-text">
                    Host, IP, or full URL for the inverter web interface.
                  </p>
                </div>

                <div>
                  <label className="label">Expected serial</label>
                  <input
                    type="text"
                    className="input"
                    value={settings?.smaExpectedSerial ?? ""}
                    onChange={(event) =>
                      onSettingChange("smaExpectedSerial", event.target.value)
                    }
                    placeholder="123456789"
                  />
                  <p className="help-text">
                    Optional guard to verify the backend hit the right device.
                  </p>
                </div>

                <div>
                  <label className="label">Connection group</label>
                  <select
                    className="input"
                    value={settings?.smaGroup ?? "user"}
                    onChange={(event) =>
                      onSettingChange("smaGroup", event.target.value)
                    }>
                    <option value="user">user</option>
                    <option value="installer">installer</option>
                  </select>
                </div>

                <div>
                  <label className="label">PV power key</label>
                  <input
                    type="text"
                    className="input"
                    value={settings?.smaPvPowerKey ?? ""}
                    onChange={(event) =>
                      onSettingChange("smaPvPowerKey", event.target.value)
                    }
                    placeholder="6100_0046C200"
                  />
                  <p className="help-text">
                    Register key used to read current PV production.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    autoComplete="current-password"
                    value={settings?.smaMeterPassword ?? ""}
                    onChange={(event) =>
                      onSettingChange("smaMeterPassword", event.target.value)
                    }
                    placeholder="SMA password"
                  />
                  <p className="help-text">
                    Login is optional on some SMA devices. The backend will fall
                    back to no-login mode when public values are exposed.
                  </p>
                </div>
              </div>

              <div className="form-grid mt-4">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={Boolean(settings?.smaUseSsl)}
                    onChange={(event) =>
                      onSettingChange("smaUseSsl", event.target.checked)
                    }
                  />
                  <span>Use HTTPS for the SMA endpoint</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={settings?.smaVerifySsl ?? true}
                    onChange={(event) =>
                      onSettingChange("smaVerifySsl", event.target.checked)
                    }
                  />
                  <span>Verify the SMA SSL certificate</span>
                </label>
              </div>
            </ConfigPanel>

            <ConfigPanel
              code="ENV"
              title="Enphase inverter"
              description="Optional Envoy endpoint for sites that expose production through Enphase."
              configured={hasEnphase}
              stateLabel={hasEnphase ? "Configured" : "Optional"}
              accent="#5ed9b4"
              expanded={expandedDevice === "enphase"}
              onToggle={() =>
                setExpandedDevice(expandedDevice === "enphase" ? null : "enphase")
              }>
              <div className="form-grid">
                <div>
                  <label className="label">Enphase base URL</label>
                  <input
                    type="text"
                    className="input"
                    autoComplete="url"
                    value={settings?.enphaseInverterBaseUrl ?? ""}
                    onChange={(event) =>
                      onSettingChange("enphaseInverterBaseUrl", event.target.value)
                    }
                    placeholder="http://192.168.1.xxx"
                  />
                </div>

                <div>
                  <label className="label">Username</label>
                  <input
                    type="text"
                    className="input"
                    autoComplete="username"
                    value={settings?.enphaseUsername ?? ""}
                    onChange={(event) =>
                      onSettingChange("enphaseUsername", event.target.value)
                    }
                    placeholder="Enlighten email or installer username"
                  />
                  <p className="help-text">
                    Firmware 7+ usually uses the Enlighten account flow for
                    token refresh.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    autoComplete="current-password"
                    value={settings?.enphasePassword ?? ""}
                    onChange={(event) =>
                      onSettingChange("enphasePassword", event.target.value)
                    }
                    placeholder="Enlighten password or local Envoy password"
                  />
                  <p className="help-text">
                    Local Envoy access still varies by firmware and SSL setup.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={Boolean(settings?.enphaseVerifySsl)}
                    onChange={(event) =>
                      onSettingChange("enphaseVerifySsl", event.target.checked)
                    }
                  />
                  <span>Verify the Enphase SSL certificate</span>
                </label>
                <p className="help-text mt-3">
                  Local Enphase Envoy devices often use self-signed
                  certificates. Leave verification off if you connect over HTTPS
                  on your LAN and trust the device.
                </p>
              </div>
            </ConfigPanel>
          </div>

          <div className="space-y-4">
            <section className="card rounded-[2.2rem] p-5">
              <div className="mb-4">
                <p className="kicker">Actions</p>
                <p className="card-header mb-1">Save and validate</p>
                <p className="text-sm text-white/55">
                  Save pushes the current form to the backend. Test runs against
                  the backend's saved settings.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70">
                  {settingsSaving ? "Saving..." : "Save settings"}
                </button>

                <button
                  type="button"
                  onClick={onTestConnection}
                  disabled={settingsTesting}
                  className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-70">
                  {settingsTesting ? "Testing..." : "Run connection test"}
                </button>
              </div>

              {settingsMessage ? (
                <div className={`notice-banner mt-4 ${messageTone}`}>
                  {settingsMessage}
                </div>
              ) : null}
            </section>

            <section className="card rounded-[2.2rem] p-5">
              <div className="mb-4">
                <p className="kicker">System status</p>
                <p className="card-header mb-1">Device readiness</p>
              </div>

              <div className="space-y-3">
                <div className="status-row">
                  <div>
                    <p className="text-sm font-medium text-white">Smart meter</p>
                    <p className="text-xs text-white/46">
                      {renderTestState(
                        hasSmartMeter,
                        testResult?.smartMeter,
                        "Waiting for test",
                      )}
                    </p>
                  </div>
                  <span className={`status-chip ${hasSmartMeter ? "ok" : "warn"}`}>
                    {hasSmartMeter ? "Configured" : "Needs setup"}
                  </span>
                </div>

                <div className="status-row">
                  <div>
                    <p className="text-sm font-medium text-white">SMA inverter</p>
                    <p className="text-xs text-white/46">
                      {renderTestState(hasSma, testResult?.sma, "Waiting for test")}
                    </p>
                  </div>
                  <span className={`status-chip ${hasSma ? "ok" : "off"}`}>
                    {hasSma ? "Configured" : "Optional"}
                  </span>
                </div>

                <div className="status-row">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Enphase inverter
                    </p>
                    <p className="text-xs text-white/46">
                      {renderTestState(
                        hasEnphase,
                        testResult?.enphase,
                        "Waiting for test",
                      )}
                    </p>
                  </div>
                  <span className={`status-chip ${hasEnphase ? "ok" : "off"}`}>
                    {hasEnphase ? "Configured" : "Optional"}
                  </span>
                </div>

                <div className="status-row">
                  <div>
                    <p className="text-sm font-medium text-white">Influx storage</p>
                    <p className="text-xs text-white/46">
                      {testResult?.storage?.error ?? "Time-series backend health"}
                    </p>
                  </div>
                  <span
                    className={`status-chip ${
                      testResult
                        ? testResult.storage?.ok
                          ? "ok"
                          : "warn"
                        : "off"
                    }`}>
                    {testResult
                      ? testResult.storage?.ok
                        ? "Reachable"
                        : "Unavailable"
                      : "Unchecked"}
                  </span>
                </div>
              </div>
            </section>

            <section className="card rounded-[2.2rem] p-5">
              <div className="mb-4">
                <p className="kicker">Notes</p>
                <p className="card-header mb-1">Practical guidance</p>
              </div>
              <div className="space-y-3 text-sm leading-6 text-white/60">
                <p>
                  Start with the smart meter. Most of the dashboard can operate
                  from that feed alone.
                </p>
                <p>
                  Add SMA or Enphase only when you want direct production data
                  instead of relying on modeled site output.
                </p>
                <p>
                  Save first, then run diagnostics. The test endpoint checks the
                  last saved backend configuration.
                </p>
              </div>
            </section>
          </div>
        </form>
      )}
    </div>
  );
}
