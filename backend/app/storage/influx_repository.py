from __future__ import annotations

import csv
from datetime import date, datetime, time, timedelta, timezone
from io import StringIO

import httpx

from ..models import AggregatePoint, DailySummary, UnifiedSample


class InfluxEnergyRepository:
    ELECTRICITY_IMPORT_METRIC = "electricity_import_w"
    ELECTRICITY_EXPORT_METRIC = "electricity_export_w"
    SOLAR_PRODUCTION_METRIC = "solar_production_w"
    GAS_FLOW_METRIC = "gas_flow_m3h"
    GAS_METER_METRIC = "gas_meter_m3"
    NET_GRID_METRIC = "net_grid_w"
    NET_HOME_METRIC = "net_home_w"
    LEGACY_GAS_THRESHOLD_M3H = 50.0

    def __init__(self, url: str, token: str, org: str, bucket: str) -> None:
        self._url = url.rstrip("/")
        self._token = token
        self._org = org
        self._bucket = bucket

    async def write_sample(self, sample: UnifiedSample) -> None:
        body = "\n".join(
            [
                self._build_line(self.ELECTRICITY_IMPORT_METRIC, sample.electricityImportW, sample.timestamp),
                self._build_line(self.ELECTRICITY_EXPORT_METRIC, sample.electricityExportW, sample.timestamp),
                self._build_line(self.SOLAR_PRODUCTION_METRIC, sample.solarProductionW, sample.timestamp),
                self._build_line(self.GAS_FLOW_METRIC, sample.gasFlowM3h, sample.timestamp),
                self._build_line(self.GAS_METER_METRIC, sample.gasMeterReadingM3, sample.timestamp),
                self._build_line(self.NET_GRID_METRIC, sample.netGridW, sample.timestamp),
                self._build_line(self.NET_HOME_METRIC, sample.netHomeW, sample.timestamp),
            ]
        )
        params = {"org": self._org, "bucket": self._bucket, "precision": "ns"}
        headers = {"Authorization": f"Token {self._token}"}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{self._url}/api/v2/write", params=params, headers=headers, content=body)
            response.raise_for_status()

    async def ping(self) -> None:
        params = {"name": self._bucket, "org": self._org}
        headers = {"Authorization": f"Token {self._token}"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{self._url}/api/v2/buckets", params=params, headers=headers)
            response.raise_for_status()

    async def get_latest(self) -> UnifiedSample | None:
        now = datetime.now(timezone.utc)
        start = now - timedelta(minutes=30)

        imported = await self.query_series(self.ELECTRICITY_IMPORT_METRIC, start, now, "1m")
        exported = await self.query_series(self.ELECTRICITY_EXPORT_METRIC, start, now, "1m")
        solar = await self.query_series(self.SOLAR_PRODUCTION_METRIC, start, now, "1m")
        gas_flow = await self.query_series(self.GAS_FLOW_METRIC, start, now, "1m")
        gas_meter = await self.query_series(self.GAS_METER_METRIC, start, now, "1m")
        net_grid = await self.query_series(self.NET_GRID_METRIC, start, now, "1m")
        net_home = await self.query_series(self.NET_HOME_METRIC, start, now, "1m")

        latest = max((p.timestamp for p in [*imported, *exported, *solar, *gas_flow, *gas_meter, *net_grid, *net_home]), default=None)
        if latest is None:
            return None

        return UnifiedSample(
            timestamp=latest,
            electricityImportW=self._last_value(imported),
            electricityExportW=self._last_value(exported),
            solarProductionW=self._last_value(solar),
            gasFlowM3h=self._select_gas_flow(gas_flow, gas_meter),
            gasMeterReadingM3=self._last_value(gas_meter),
            netGridW=self._last_value(net_grid),
            netHomeW=self._last_value(net_home),
        )

    async def get_consumption(self, start: datetime, end: datetime, window: str) -> list[AggregatePoint]:
        return await self.query_series(self.NET_HOME_METRIC, start, end, self._map_window(window))

    async def get_production(self, start: datetime, end: datetime, window: str) -> list[AggregatePoint]:
        return await self.query_series(self.SOLAR_PRODUCTION_METRIC, start, end, self._map_window(window))

    async def get_gas(self, start: datetime, end: datetime, window: str) -> list[AggregatePoint]:
        every = self._map_window(window)
        gas_flow = await self.query_series(self.GAS_FLOW_METRIC, start, end, every)
        gas_meter = await self.query_series(self.GAS_METER_METRIC, start, end, every)

        if len(gas_meter) > 1:
            return self._derive_flow_series_from_meter(gas_meter)
        if self._looks_like_legacy_gas_meter_series(gas_flow):
            return self._derive_flow_series_from_meter(gas_flow)
        return gas_flow

    async def get_today_summary(self, local_date: date) -> DailySummary:
        local_start = datetime.combine(local_date, time.min).astimezone()
        start = local_start.astimezone(timezone.utc)
        end = datetime.now(timezone.utc)

        usage = await self.query_series(self.NET_HOME_METRIC, start, end, "15m")
        prod = await self.query_series(self.SOLAR_PRODUCTION_METRIC, start, end, "15m")
        imported = await self.query_series(self.ELECTRICITY_IMPORT_METRIC, start, end, "15m")
        exported = await self.query_series(self.ELECTRICITY_EXPORT_METRIC, start, end, "15m")
        gas_meter = await self.query_series(self.GAS_METER_METRIC, start, end, "15m")
        legacy = [] if gas_meter else await self.query_series(self.GAS_FLOW_METRIC, start, end, "15m")

        elapsed_hours = max(0.0, min(24.0, (datetime.now().astimezone() - local_start).total_seconds() / 3600.0))
        used_kwh = (sum(max(p.value, 0) for p in usage) / len(usage) * elapsed_hours / 1000.0) if usage else 0.0
        produced_kwh = (sum(p.value for p in prod) / len(prod) * elapsed_hours / 1000.0) if prod else 0.0
        imported_kwh = (sum(p.value for p in imported) / len(imported) * elapsed_hours / 1000.0) if imported else 0.0
        exported_kwh = (sum(p.value for p in exported) / len(exported) * elapsed_hours / 1000.0) if exported else 0.0
        gas_m3 = self._compute_gas_consumed_today(gas_meter, legacy)
        solar_used_kwh = max(used_kwh - imported_kwh, 0.0)
        coverage = 0.0 if used_kwh <= 0 else min(100.0, (solar_used_kwh / used_kwh) * 100.0)

        return DailySummary(
            date=local_date,
            usedKwh=used_kwh,
            producedKwh=produced_kwh,
            importedKwh=imported_kwh,
            exportedKwh=exported_kwh,
            gasM3=gas_m3,
            solarCoveragePct=coverage,
        )

    async def query_series(self, metric: str, start: datetime, end: datetime, every: str) -> list[AggregatePoint]:
        flux = (
            f'from(bucket: "{self._bucket}")'
            f' |> range(start: {start.isoformat()}, stop: {end.isoformat()})'
            f' |> filter(fn: (r) => r._measurement == "energy" and r.metric == "{metric}")'
            f' |> aggregateWindow(every: {every}, fn: mean, createEmpty: false)'
            ' |> keep(columns: ["_time", "_value"])'
        )

        headers = {
            "Authorization": f"Token {self._token}",
            "Accept": "application/csv",
        }
        payload = {"query": flux}
        params = {"org": self._org}

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(f"{self._url}/api/v2/query", params=params, headers=headers, json=payload)
            response.raise_for_status()

        return self._parse_influx_csv(response.text)

    @staticmethod
    def _parse_influx_csv(content: str) -> list[AggregatePoint]:
        rows: list[AggregatePoint] = []
        reader = csv.reader(StringIO(content))
        for parts in reader:
            if not parts:
                continue
            if parts[0].startswith("#"):
                continue
            if "result" in parts and "table" in parts:
                continue
            if len(parts) < 2:
                continue
            raw_time = parts[-2].strip()
            raw_value = parts[-1].strip()
            try:
                timestamp = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
                value = float(raw_value)
            except ValueError:
                continue
            rows.append(AggregatePoint(timestamp=timestamp, value=value))
        return rows

    @staticmethod
    def _build_line(metric: str, value: float, timestamp: datetime) -> str:
        ns = int(timestamp.timestamp() * 1_000_000_000)
        return f"energy,metric={metric} value={value} {ns}"

    @staticmethod
    def _last_value(points: list[AggregatePoint]) -> float:
        return points[-1].value if points else 0.0

    def _select_gas_flow(self, gas_flow: list[AggregatePoint], gas_meter: list[AggregatePoint]) -> float:
        latest = self._last_value(gas_flow)
        if 0 < latest < self.LEGACY_GAS_THRESHOLD_M3H:
            return latest

        if len(gas_meter) > 1:
            derived = self._derive_flow_series_from_meter(gas_meter)
            return self._last_value(derived)

        if self._looks_like_legacy_gas_meter_series(gas_flow):
            derived = self._derive_flow_series_from_meter(gas_flow)
            return self._last_value(derived)

        return max(0.0, min(self.LEGACY_GAS_THRESHOLD_M3H, latest))

    @staticmethod
    def _compute_gas_consumed_today(gas_meter: list[AggregatePoint], legacy: list[AggregatePoint]) -> float:
        if len(gas_meter) > 1:
            return InfluxEnergyRepository._compute_meter_delta(gas_meter)
        if InfluxEnergyRepository._looks_like_legacy_gas_meter_series(legacy):
            return InfluxEnergyRepository._compute_meter_delta(legacy)
        return 0.0

    @staticmethod
    def _compute_meter_delta(points: list[AggregatePoint]) -> float:
        if len(points) < 2:
            return 0.0
        delta = points[-1].value - points[0].value
        return delta if delta > 0 else 0.0

    @staticmethod
    def _looks_like_legacy_gas_meter_series(points: list[AggregatePoint]) -> bool:
        return len(points) > 1 and max((p.value for p in points), default=0.0) > InfluxEnergyRepository.LEGACY_GAS_THRESHOLD_M3H

    @staticmethod
    def _derive_flow_series_from_meter(meter_series: list[AggregatePoint]) -> list[AggregatePoint]:
        flow: list[AggregatePoint] = []
        for idx in range(1, len(meter_series)):
            previous = meter_series[idx - 1]
            current = meter_series[idx]
            elapsed_hours = (current.timestamp - previous.timestamp).total_seconds() / 3600.0
            delta_m3 = current.value - previous.value
            if elapsed_hours <= 0 or delta_m3 < 0:
                continue
            flow_m3h = max(0.0, min(InfluxEnergyRepository.LEGACY_GAS_THRESHOLD_M3H, delta_m3 / elapsed_hours))
            flow.append(AggregatePoint(timestamp=current.timestamp, value=flow_m3h))
        return flow

    @staticmethod
    def _map_window(window: str) -> str:
        match window.lower():
            case "hour":
                return "5m"
            case "month":
                return "1d"
            case _:
                return "1h"
