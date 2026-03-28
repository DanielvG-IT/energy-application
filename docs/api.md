# API

## GET /api/now

Returns the latest unified sample.

Example response:

```json
{
  "timestamp": "2026-03-28T11:24:00Z",
  "electricityImportW": 860.0,
  "electricityExportW": 120.0,
  "solarProductionW": 2500.0,
  "gasFlowM3h": 0.12,
  "netGridW": 740.0,
  "netHomeW": 3240.0
}
```

## GET /api/today

Returns daily totals and simple insight cards.

## GET /api/history?window=hour|day|month&from=...&to=...

Returns aggregated series for consumption, production, and gas.

## GET /api/health

Simple health endpoint.
