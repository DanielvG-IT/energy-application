from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import aiohttp
from pysma import SmaAuthenticationException, SmaConnectionException, SmaReadException, SMAWebConnect

from ..failures import AuthFailure, ConfigFailure, TransientFailure
from ..models import RuntimeEnergySettings, SolarRealtime


class SmaInverterAdapter:
    def __init__(self) -> None:
        self._client_session: aiohttp.ClientSession | None = None
        self._sma: SMAWebConnect | None = None
        self._sensors: Any = None
        self._base_url: str | None = None
        self._password: str | None = None
        self._group: str | None = None

    async def close(self) -> None:
        if self._sma is not None:
            try:
                await self._sma.close_session()
            except Exception:
                pass
        if self._client_session is not None and not self._client_session.closed:
            await self._client_session.close()

    async def get_realtime(self, cfg: RuntimeEnergySettings) -> SolarRealtime:
        if not cfg.smaInverterBaseUrl:
            raise ConfigFailure(self.__class__.__name__, "smaInverterBaseUrl is required.")

        group = cfg.smaGroup if cfg.smaGroup in {"user", "installer"} else "user"
        protocol = "https" if cfg.smaUseSsl else "http"
        base_url = cfg.smaInverterBaseUrl
        if not base_url.startswith("http://") and not base_url.startswith("https://"):
            base_url = f"{protocol}://{base_url}"

        password = (cfg.smaMeterPassword or "installer").strip() or "installer"

        await self._ensure_client(base_url, password, group, cfg.smaVerifySsl)

        try:
            if self._sma is None:
                raise ConfigFailure(self.__class__.__name__, "SMA client was not initialized.")
            if self._sensors is None:
                self._sensors = await self._sma.get_sensors()
            await self._sma.read(self._sensors)
            watts = self._extract_power(self._sensors)
            return SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=watts)
        except SmaAuthenticationException as ex:
            raise AuthFailure(self.__class__.__name__, "SMA authentication failed.", ex) from ex
        except SmaConnectionException as ex:
            raise TransientFailure(self.__class__.__name__, "SMA connection failed.", ex) from ex
        except SmaReadException as ex:
            raise TransientFailure(self.__class__.__name__, "SMA read failed.", ex) from ex

    async def _ensure_client(self, base_url: str, password: str, group: str, verify_ssl: bool) -> None:
        has_changed = any(
            [
                self._sma is None,
                self._base_url != base_url,
                self._password != password,
                self._group != group,
            ]
        )

        if not has_changed:
            return

        await self.close()
        self._client_session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=verify_ssl))
        self._sma = SMAWebConnect(
            session=self._client_session,
            url=base_url,
            password=password,
            group=group,
        )

        try:
            await self._sma.device_info()
            self._sensors = await self._sma.get_sensors()
        except SmaAuthenticationException as ex:
            raise AuthFailure(self.__class__.__name__, "SMA login rejected.", ex) from ex
        except (SmaReadException, SmaConnectionException) as ex:
            raise TransientFailure(self.__class__.__name__, "SMA setup failed.", ex) from ex

        self._base_url = base_url
        self._password = password
        self._group = group

    @staticmethod
    def _extract_power(sensors: Any) -> float:
        candidate_names = ["pv_power", "metering_power_supplied", "power"]

        for name in candidate_names:
            sensor = getattr(sensors, name, None)
            value = SmaInverterAdapter._value_from_sensor(sensor)
            if value is not None:
                return max(0.0, value)

        if isinstance(sensors, dict):
            for key in candidate_names:
                if key in sensors:
                    value = SmaInverterAdapter._value_from_sensor(sensors[key])
                    if value is not None:
                        return max(0.0, value)

        # As a last resort, walk all items and return the first positive numeric value.
        if isinstance(sensors, dict):
            for sensor in sensors.values():
                value = SmaInverterAdapter._value_from_sensor(sensor)
                if value is not None and value >= 0:
                    return value

        return 0.0

    @staticmethod
    def _value_from_sensor(sensor: Any) -> float | None:
        if sensor is None:
            return None

        if isinstance(sensor, (int, float)):
            return float(sensor)

        for attr in ("value", "current_value", "state"):
            if hasattr(sensor, attr):
                candidate = getattr(sensor, attr)
                try:
                    if candidate is not None:
                        return float(candidate)
                except (TypeError, ValueError):
                    continue

        return None
