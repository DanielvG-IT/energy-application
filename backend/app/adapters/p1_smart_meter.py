from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from ..failures import AuthFailure, ConfigFailure, TransientFailure
from ..models import RuntimeEnergySettings, SmartMeterRealtime


class P1SmartMeterAdapter:
    def __init__(self) -> None:
        self._gas_lock = asyncio.Lock()
        self._last_gas_meter_m3: float | None = None
        self._last_gas_timestamp: datetime | None = None

    async def get_realtime(self, cfg: RuntimeEnergySettings) -> SmartMeterRealtime:
        if not cfg.smartMeterBaseUrl:
            raise ConfigFailure(self.__class__.__name__, "smartMeterBaseUrl is required.")

        base_url = cfg.smartMeterBaseUrl.rstrip("/")
        timestamp = datetime.now(timezone.utc)
        power_consumed, power_produced, gas_meter_m3 = await self._fetch_sensor_values(base_url)
        gas_flow_m3h = await self._calculate_gas_flow(gas_meter_m3, timestamp)

        return SmartMeterRealtime(
            timestamp=timestamp,
            electricity_import_w=power_consumed,
            electricity_export_w=power_produced,
            gas_flow_m3h=gas_flow_m3h,
            gas_meter_reading_m3=gas_meter_m3,
        )

    async def _fetch_sensor_values(self, base_url: str) -> tuple[float, float, float]:
        consumed_task = self._query_sensor(f"{base_url}/sensor/power_consumed", "power_consumed")
        produced_task = self._query_sensor(f"{base_url}/sensor/power_produced", "power_produced")
        gas_task = self._query_sensor(f"{base_url}/sensor/gas_consumed", "gas_consumed")
        return await asyncio.gather(consumed_task, produced_task, gas_task)

    async def _calculate_gas_flow(self, gas_meter_m3: float, timestamp: datetime) -> float:
        async with self._gas_lock:
            if self._last_gas_meter_m3 is None or self._last_gas_timestamp is None:
                self._last_gas_meter_m3 = gas_meter_m3
                self._last_gas_timestamp = timestamp
                return 0.0

            elapsed_hours = (timestamp - self._last_gas_timestamp).total_seconds() / 3600.0
            delta_m3 = gas_meter_m3 - self._last_gas_meter_m3

            self._last_gas_meter_m3 = gas_meter_m3
            self._last_gas_timestamp = timestamp

            if elapsed_hours <= 0 or delta_m3 <= 0:
                return 0.0

            flow = delta_m3 / elapsed_hours
            return flow if 0 < flow < 100 else 0.0

    async def _query_sensor(self, endpoint: str, sensor_name: str) -> float:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(endpoint)
        except httpx.TimeoutException as ex:
            raise TransientFailure(self.__class__.__name__, f"Timeout while querying {sensor_name}.", ex) from ex
        except httpx.HTTPError as ex:
            raise TransientFailure(self.__class__.__name__, f"Failed to query {sensor_name}.", ex) from ex

        if response.status_code == 404:
            return 0.0
        if response.status_code in {401, 403}:
            raise AuthFailure(self.__class__.__name__, f"Sensor '{sensor_name}' returned unauthorized status.")
        if response.status_code >= 500:
            raise TransientFailure(self.__class__.__name__, f"Sensor '{sensor_name}' transient error status.")
        if response.status_code >= 400:
            raise ConfigFailure(self.__class__.__name__, f"Sensor '{sensor_name}' configuration error status.")

        payload = response.json()
        value = payload.get("value")
        return float(value) if value is not None else 0.0
