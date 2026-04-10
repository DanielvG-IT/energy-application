from __future__ import annotations

from datetime import datetime, timezone

from ..failures import AdapterFailure, AuthFailure, ConfigFailure, TransientFailure
from ..models import RuntimeEnergySettings, SolarRealtime
from .enphase_adapter import EnphaseInverterAdapter
from .sma_adapter import SmaInverterAdapter


class ConfiguredSolarInverterAdapter:
    def __init__(self, sma: SmaInverterAdapter, enphase: EnphaseInverterAdapter) -> None:
        self._sma = sma
        self._enphase = enphase

    async def get_realtime(self, cfg: RuntimeEnergySettings) -> SolarRealtime:
        tasks: list[tuple[str, bool, object]] = []

        if cfg.smaInverterBaseUrl:
            tasks.append(("sma", True, self._sma.get_realtime(cfg)))

        if cfg.enphaseInverterBaseUrl:
            tasks.append(("enphase", True, self._enphase.get_realtime(cfg)))

        if not tasks:
            raise ConfigFailure(self.__class__.__name__, "At least one solar source must be configured.")

        results: list[SolarRealtime] = []
        failures: list[Exception] = []
        for _, _, coro in tasks:
            try:
                sample = await coro
                results.append(sample)
            except Exception as ex:
                failures.append(ex)

        if not results:
            raise self._build_aggregate_failure(failures)

        return SolarRealtime(
            timestamp=datetime.now(timezone.utc),
            production_w=sum(sample.production_w for sample in results),
        )

    @staticmethod
    def _build_aggregate_failure(failures: list[Exception]) -> AdapterFailure:
        auth = next((f for f in failures if isinstance(f, AuthFailure)), None)
        if auth is not None:
            return AuthFailure(
                "ConfiguredSolarInverterAdapter",
                "All configured solar sources failed; at least one authentication failure occurred.",
                auth,
            )

        transient = next((f for f in failures if isinstance(f, TransientFailure)), None)
        if transient is not None:
            return TransientFailure(
                "ConfiguredSolarInverterAdapter",
                "All configured solar sources failed due to transient errors.",
                transient,
            )

        config = next((f for f in failures if isinstance(f, ConfigFailure)), None)
        if config is not None:
            return ConfigFailure(
                "ConfiguredSolarInverterAdapter",
                "All configured solar sources failed due to configuration errors.",
                config,
            )

        return TransientFailure(
            "ConfiguredSolarInverterAdapter",
            "All configured solar sources failed with unexpected errors.",
            failures[0] if failures else None,
        )
