# Plugin to Adapter Mapping

This project keeps your Home Assistant plugin code as a reference source for metric naming and supported capabilities.

## SMA mapping

Based on `plugin/sma/sensor.py`:

- `pv_power` -> solar production watts
- `grid_power` -> net grid power approximation
- optional phase metrics can be added later for detailed per-phase views

## Enphase mapping

Based on `plugin/enphase_envoy/sensor.py`:

- `production` -> current solar production watts
- `daily_production` -> daily production kWh calculations
- `consumption` and related fields can support richer balance analytics

## Why separate runtime adapters

Home Assistant integrations depend on Home Assistant framework and ecosystem libraries. This project runs independently as a local service, so runtime adapters are isolated and kept lightweight while preserving similar field semantics.
