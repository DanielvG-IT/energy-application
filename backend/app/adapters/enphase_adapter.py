from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import aiohttp
import httpx
from pyenphase import Envoy, EnvoyAuthenticationError, EnvoyAuthenticationRequired, EnvoyError

from ..failures import AuthFailure, ConfigFailure, TransientFailure
from ..models import RuntimeEnergySettings, SolarRealtime


class EnphaseInverterAdapter:
    def __init__(self) -> None:
        self._envoy: Envoy | None = None
        self._host: str | None = None
        self._verify_ssl: bool = False
        self._session: aiohttp.ClientSession | None = None

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()

    async def get_realtime(self, cfg: RuntimeEnergySettings) -> SolarRealtime:
        if not cfg.enphaseInverterBaseUrl:
            raise ConfigFailure(self.__class__.__name__, "enphaseInverterBaseUrl is required.")

        parsed = urlparse(cfg.enphaseInverterBaseUrl)
        host = parsed.hostname or cfg.enphaseInverterBaseUrl
        await self._ensure_envoy(host, cfg.enphaseVerifySsl)

        try:
            if self._envoy is None:
                raise ConfigFailure(self.__class__.__name__, "Enphase client was not initialized.")

            await self._envoy.setup()
            username = (cfg.enphaseUsername or "").strip()
            password = cfg.enphasePassword or ""
            token = (cfg.enphaseToken or "").strip()

            if username and password:
                if token:
                    try:
                        await self._envoy.authenticate(username=username, password=password, token=token)
                    except (EnvoyAuthenticationError, EnvoyAuthenticationRequired):
                        # Mirror the plugin behavior: if token auth is stale/invalid, retry with user/pass.
                        await self._envoy.authenticate(username=username, password=password)
                else:
                    await self._envoy.authenticate(username=username, password=password)
            else:
                # Some Envoy installations expose local production endpoints without credentials.
                watts = await self._fallback_query(cfg)
                return SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=watts)

            envoy_data = await self._envoy.update()
            watts = self._extract_production(envoy_data.raw if hasattr(envoy_data, "raw") else envoy_data)
            return SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=watts)
        except (EnvoyAuthenticationError, EnvoyAuthenticationRequired) as ex:
            try:
                watts = await self._fallback_query(cfg)
                return SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=watts)
            except AuthFailure:
                message = str(ex).strip() or "Enphase authentication failed."
                if "enlighten" in message.lower() and "401" in message:
                    message = (
                        "Enphase authentication failed: Enlighten credentials were rejected. "
                        "Use valid Enphase Enlighten username/password, or provide a valid enphaseToken/enphaseSessionId."
                    )
                raise AuthFailure(self.__class__.__name__, message, ex) from ex
        except EnvoyError as ex:
            raise TransientFailure(self.__class__.__name__, "Enphase read failed.", ex) from ex
        except TypeError:
            # Some installations can work without pyenphase auth using local session cookie.
            watts = await self._fallback_query(cfg)
            return SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=watts)

    async def _ensure_envoy(self, host: str, verify_ssl: bool) -> None:
        if self._envoy is not None and self._host == host and self._verify_ssl == verify_ssl:
            return
        if self._session is not None:
            await self._session.close()
        self._host = host
        self._verify_ssl = verify_ssl
        connector = aiohttp.TCPConnector(ssl=verify_ssl)
        self._session = aiohttp.ClientSession(connector=connector)
        self._envoy = Envoy(host, self._session)

    async def _fallback_query(self, cfg: RuntimeEnergySettings) -> float:
        base = cfg.enphaseInverterBaseUrl.rstrip("/")
        endpoints = [
            "/api/v1/production",
            "/production.json",
            "/ivp/meters/readings",
        ]
        headers: dict[str, str] = {}
        if cfg.enphaseSessionId:
            headers["Cookie"] = f"sessionId={cfg.enphaseSessionId}"
        if cfg.enphaseToken:
            headers["Authorization"] = f"Bearer {cfg.enphaseToken}"

        try:
            async with httpx.AsyncClient(timeout=10.0, verify=cfg.enphaseVerifySsl) as client:
                saw_unauthorized = False
                for endpoint in endpoints:
                    response = await client.get(f"{base}{endpoint}", headers=headers)
                    if response.status_code in {401, 403}:
                        saw_unauthorized = True
                        continue
                    if response.status_code >= 500:
                        continue
                    if not response.is_success:
                        continue
                    watts = self._extract_production(response.json())
                    if watts >= 0:
                        return watts
                if saw_unauthorized:
                    if not (cfg.enphaseUsername and cfg.enphasePassword) and not cfg.enphaseToken and not cfg.enphaseSessionId:
                        raise AuthFailure(
                            self.__class__.__name__,
                            "Enphase returned unauthorized status. Set enphaseUsername/enphasePassword (Enlighten account) or a valid enphaseToken/enphaseSessionId.",
                        )
                    raise AuthFailure(self.__class__.__name__, "Enphase returned unauthorized status.")
        except httpx.HTTPError as ex:
            raise TransientFailure(self.__class__.__name__, "Enphase fallback query failed.", ex) from ex

        raise ConfigFailure(self.__class__.__name__, "Enphase did not return a supported production payload.")

    @staticmethod
    def _extract_production(payload: Any) -> float:
        if isinstance(payload, dict):
            for key in ("production", "current_power", "wattsNow", "wNow"):
                if key in payload and isinstance(payload[key], (int, float)):
                    return max(0.0, float(payload[key]))

            if "production" in payload and isinstance(payload["production"], list):
                for item in payload["production"]:
                    if not isinstance(item, dict):
                        continue
                    for key in ("wNow", "watts", "value"):
                        value = item.get(key)
                        if isinstance(value, (int, float)):
                            return max(0.0, float(value))

            if "meters" in payload and isinstance(payload["meters"], list):
                for meter in payload["meters"]:
                    if not isinstance(meter, dict):
                        continue
                    if meter.get("type") in {"production", "pv"}:
                        value = meter.get("activePower") or meter.get("instant_power")
                        if isinstance(value, (int, float)):
                            return max(0.0, float(value))

        return 0.0
