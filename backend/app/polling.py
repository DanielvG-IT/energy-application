from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from .adapters.configured_solar import ConfiguredSolarInverterAdapter
from .adapters.p1_smart_meter import P1SmartMeterAdapter
from .calculator import EnergyCalculator
from .failures import AdapterFailure
from .models import SolarRealtime
from .settings_store import RuntimeEnergySettingsStore
from .storage.influx_repository import InfluxEnergyRepository

logger = logging.getLogger(__name__)


class EnergyPollingService:
    def __init__(
        self,
        settings_store: RuntimeEnergySettingsStore,
        smart_meter: P1SmartMeterAdapter,
        solar_adapter: ConfiguredSolarInverterAdapter,
        calculator: EnergyCalculator,
        repository: InfluxEnergyRepository,
    ) -> None:
        self._settings_store = settings_store
        self._smart_meter = smart_meter
        self._solar_adapter = solar_adapter
        self._calculator = calculator
        self._repository = repository
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._smart_missing_logged = False
        self._solar_missing_logged = False

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            await self._task

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            cfg = self._settings_store.get()
            interval = max(5, min(30, cfg.pollingSeconds))

            if not cfg.smartMeterBaseUrl:
                if not self._smart_missing_logged:
                    logger.info("Skipping polling until smart meter URL is configured via /api/settings.")
                    self._smart_missing_logged = True
                await self._sleep(interval)
                continue

            self._smart_missing_logged = False

            try:
                meter = await self._smart_meter.get_realtime(cfg)

                if not cfg.smaInverterBaseUrl and not cfg.enphaseInverterBaseUrl:
                    if not self._solar_missing_logged:
                        logger.info("No solar source configured yet; using 0W fallback until configured via /api/settings.")
                        self._solar_missing_logged = True
                    solar = SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=0.0)
                else:
                    self._solar_missing_logged = False
                    try:
                        solar = await self._solar_adapter.get_realtime(cfg)
                    except AdapterFailure as ex:
                        logger.warning("Solar adapter failure (%s): %s. Using 0W fallback.", ex.kind, ex)
                        solar = SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=0.0)
                    except Exception as ex:
                        logger.warning("Solar adapter unexpected failure: %s. Using 0W fallback.", ex)
                        solar = SolarRealtime(timestamp=datetime.now(timezone.utc), production_w=0.0)

                merged = self._calculator.merge(meter, solar)
                await self._repository.write_sample(merged)
            except AdapterFailure as ex:
                logger.warning("Polling cycle adapter failure (%s) in %s: %s", ex.kind, ex.adapter, ex)
            except Exception as ex:
                logger.warning("Polling cycle failed: %s", ex)

            await self._sleep(interval)

    async def _sleep(self, seconds: int) -> None:
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass
