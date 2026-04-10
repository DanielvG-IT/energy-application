from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .adapters.configured_solar import ConfiguredSolarInverterAdapter
from .adapters.enphase_adapter import EnphaseInverterAdapter
from .adapters.p1_smart_meter import P1SmartMeterAdapter
from .adapters.sma_adapter import SmaInverterAdapter
from .calculator import EnergyCalculator
from .failures import AdapterFailure
from .models import RuntimeEnergySettings, SettingsTestProbe, SettingsTestResponse
from .polling import EnergyPollingService
from .service import EnergyService
from .settings_store import RuntimeEnergySettingsStore
from .storage.influx_repository import InfluxEnergyRepository

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def _influx_env(name: str, default: str = "") -> str:
    return os.getenv(f"Influx__{name}", os.getenv(f"INFLUX_{name.upper()}", default))


class AppState:
    def __init__(self) -> None:
        self.settings_store = RuntimeEnergySettingsStore(Path(__file__).resolve().parent.parent / "energy-settings.db")
        self.calculator = EnergyCalculator()
        self.repository = InfluxEnergyRepository(
            url=_influx_env("Url", "http://influxdb:8086"),
            token=_influx_env("Token", ""),
            org=_influx_env("Org", "home"),
            bucket=_influx_env("Bucket", "energy"),
        )
        self.smart_meter = P1SmartMeterAdapter()
        self.sma = SmaInverterAdapter()
        self.enphase = EnphaseInverterAdapter()
        self.solar = ConfiguredSolarInverterAdapter(self.sma, self.enphase)
        self.energy_service = EnergyService(self.repository, self.calculator)
        self.poller = EnergyPollingService(
            settings_store=self.settings_store,
            smart_meter=self.smart_meter,
            solar_adapter=self.solar,
            calculator=self.calculator,
            repository=self.repository,
        )


state = AppState()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await state.poller.start()
    try:
        yield
    finally:
        await state.poller.stop()
        await state.sma.close()
        await state.enphase.close()


app = FastAPI(lifespan=lifespan)

allowed_origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/now")
async def get_now() -> Any:
    try:
        now = await state.energy_service.get_now()
        if now is None:
            return Response(status_code=204)
        return now
    except Exception as ex:
        raise HTTPException(status_code=503, detail=f"Time-series storage unavailable: {ex}") from ex


@app.get("/api/today")
async def get_today() -> dict[str, Any]:
    try:
        summary, insights = await state.energy_service.get_today()
        return {"summary": summary, "insights": insights}
    except Exception as ex:
        raise HTTPException(status_code=503, detail=f"Time-series storage unavailable: {ex}") from ex


@app.get("/api/history")
async def get_history(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    window: str | None = Query(default=None),
):
    try:
        return await state.energy_service.get_history(_normalize_datetime(from_), _normalize_datetime(to), window)
    except Exception as ex:
        raise HTTPException(status_code=503, detail=f"Time-series storage unavailable: {ex}") from ex


@app.get("/api/settings")
async def get_settings() -> RuntimeEnergySettings:
    return state.settings_store.get()


@app.put("/api/settings")
async def update_settings(request: RuntimeEnergySettings) -> RuntimeEnergySettings:
    try:
        return state.settings_store.update(request)
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex)) from ex


def _format_failure(ex: Exception) -> str:
    if isinstance(ex, AdapterFailure):
        return f"{ex.kind}: {ex}"
    return str(ex)


async def _run_probe(probe: Callable[[], Awaitable[dict[str, Any] | None]], timeout_seconds: int = 10) -> tuple[bool, str | None, dict[str, Any] | None]:
    try:
        sample = await asyncio.wait_for(probe(), timeout=timeout_seconds)
        return True, None, sample
    except asyncio.TimeoutError:
        return False, f"Timed out after {timeout_seconds} seconds.", None
    except Exception as ex:
        return False, _format_failure(ex), None


@app.post("/api/settings/test")
async def test_settings() -> SettingsTestResponse:
    cfg = state.settings_store.get()
    sma_configured = bool(cfg.smaInverterBaseUrl)
    enphase_configured = bool(cfg.enphaseInverterBaseUrl)

    meter_task = _run_probe(
        lambda: _probe_smart_meter(cfg),
    )

    sma_task = _run_probe(lambda: _probe_sma(cfg)) if sma_configured else asyncio.sleep(0, result=(False, None, None))
    enphase_task = _run_probe(lambda: _probe_enphase(cfg)) if enphase_configured else asyncio.sleep(0, result=(False, None, None))
    storage_task = _run_probe(_probe_storage)

    meter_result, sma_result, enphase_result, storage_result = await asyncio.gather(
        meter_task,
        sma_task,
        enphase_task,
        storage_task,
    )

    meter_ok, meter_error, meter_sample = meter_result
    sma_ok, sma_error, sma_sample = sma_result
    enphase_ok, enphase_error, enphase_sample = enphase_result
    storage_ok, storage_error, storage_sample = storage_result

    configured_solar_results = [
        entry
        for entry in (
            {"configured": sma_configured, "ok": sma_ok},
            {"configured": enphase_configured, "ok": enphase_ok},
        )
        if entry["configured"]
    ]

    solar_ok = (not configured_solar_results) or all(item["ok"] for item in configured_solar_results)
    solar_partial = any(item["ok"] for item in configured_solar_results) and any(
        (not item["ok"]) for item in configured_solar_results
    )
    ok = meter_ok and solar_ok and storage_ok

    return SettingsTestResponse(
        ok=ok,
        smartMeter=SettingsTestProbe(ok=meter_ok, error=meter_error, sample=meter_sample),
        solar={"ok": solar_ok, "partial": solar_partial, "configured": bool(configured_solar_results)},
        sma={"configured": sma_configured, "ok": sma_configured and sma_ok, "error": sma_error, "sample": sma_sample},
        enphase={
            "configured": enphase_configured,
            "ok": enphase_configured and enphase_ok,
            "error": enphase_error,
            "sample": enphase_sample,
        },
        storage=SettingsTestProbe(ok=storage_ok, error=storage_error, sample=storage_sample),
    )


async def _probe_smart_meter(cfg: RuntimeEnergySettings) -> dict[str, Any]:
    meter = await state.smart_meter.get_realtime(cfg)
    return {
        "electricityImportW": meter.electricity_import_w,
        "electricityExportW": meter.electricity_export_w,
        "gasFlowM3h": meter.gas_flow_m3h,
    }


async def _probe_sma(cfg: RuntimeEnergySettings) -> dict[str, Any]:
    solar = await state.sma.get_realtime(cfg)
    return {"productionW": solar.production_w}


async def _probe_enphase(cfg: RuntimeEnergySettings) -> dict[str, Any]:
    solar = await state.enphase.get_realtime(cfg)
    return {"productionW": solar.production_w}


async def _probe_storage() -> dict[str, str]:
    await state.repository.ping()
    return {"status": "reachable"}
