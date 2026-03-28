# Plugin Conversion Notes

This project started by borrowing metric names from the Home Assistant plugins in `plugin/`, but the working integrations contain important runtime behavior that also needs to be ported.

## Current conversion status

### SMA (`plugin/sma`)

- Plugin behavior is based on `pysma==1.1.0`.
- The plugin config model is:
  - `host`
  - `password`
  - `ssl`
  - `verify_ssl`
  - `group`
- Our backend already mirrors most of that shape.
- We have also hardened the custom SMA adapter so unexpected `null` fields no longer crash the login/session parsing path.

Remaining gap:
- The Home Assistant plugin relies on `pysma` session management and sensor discovery. Our C# adapter is still a partial reimplementation, not a full port of `pysma`.

### Enphase (`plugin/enphase_envoy`)

- Plugin behavior is based on `pyenphase==2.4.6`.
- The plugin setup/auth flow is:
  - connect to host with `verify_ssl=False` by default
  - run setup to detect firmware/serial
  - authenticate with username/password and, for newer firmware, a token
  - refresh token when needed
  - read from multiple local Envoy endpoints
- Our backend now mirrors more of that behavior:
  - SSL verification toggle for local/self-signed Envoy devices
  - bearer token setting for firmware 7+ style access
  - probing multiple production endpoints instead of only `/production.json`
  - legacy session cookie retained as fallback only

Remaining gap:
- We do not yet have the full `pyenphase` authentication lifecycle in C#:
  - firmware-aware setup
  - token acquisition/refresh
  - broader endpoint/model parsing beyond the production watts path

## Recommended next steps

1. Port the Enphase setup/auth lifecycle more faithfully:
   - detect firmware/serial from local setup endpoints
   - support the modern token-based flow end-to-end
   - persist and refresh the token like the Home Assistant integration

2. Reduce the SMA custom surface area:
   - align request/session behavior with `pysma`
   - validate device info early, similar to the plugin config flow

3. Expand data collection:
   - Enphase consumption/storage/inventory endpoints
   - SMA grid power and additional sensor fields that map cleanly into our domain model
