from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


@dataclass(slots=True)
class SmartMeterRealtime:
    timestamp: datetime
    electricity_import_w: float
    electricity_export_w: float
    gas_flow_m3h: float
    gas_meter_reading_m3: float


@dataclass(slots=True)
class SolarRealtime:
    timestamp: datetime
    production_w: float


class UnifiedSample(BaseModel):
    timestamp: datetime
    electricityImportW: float
    electricityExportW: float
    solarProductionW: float
    gasFlowM3h: float
    gasMeterReadingM3: float
    netGridW: float
    netHomeW: float


class DailySummary(BaseModel):
    date: date
    usedKwh: float
    producedKwh: float
    importedKwh: float
    exportedKwh: float
    gasM3: float
    solarCoveragePct: float


class InsightCard(BaseModel):
    title: str
    value: str
    context: str


class AggregatePoint(BaseModel):
    timestamp: datetime
    value: float


class HistoryResponse(BaseModel):
    window: str
    consumption: list[AggregatePoint]
    production: list[AggregatePoint]
    gas: list[AggregatePoint]


class RuntimeEnergySettings(BaseModel):
    pollingSeconds: int = Field(default=10)
    smartMeterBaseUrl: str = ""
    smaInverterBaseUrl: str = ""
    smaUseSsl: bool = False
    smaVerifySsl: bool = True
    smaGroup: str = "user"
    smaExpectedSerial: str = ""
    enphaseInverterBaseUrl: str = ""
    enphaseVerifySsl: bool = False
    enphaseUsername: str = ""
    enphasePassword: str = ""
    enphaseToken: str = ""
    smaMeterUsername: str = "installer"
    smaMeterPassword: str = "installer"
    smaLoginRight: str = "usr"
    smaPvPowerKey: str = "6100_0046C200"
    enphaseSessionId: str = ""


class SettingsTestProbe(BaseModel):
    ok: bool
    error: str | None
    sample: dict[str, Any] | None


class SettingsTestResponse(BaseModel):
    ok: bool
    smartMeter: SettingsTestProbe
    solar: dict[str, Any]
    sma: dict[str, Any]
    enphase: dict[str, Any]
    storage: SettingsTestProbe
