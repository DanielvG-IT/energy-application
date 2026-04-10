from __future__ import annotations

from .models import DailySummary, InsightCard, SmartMeterRealtime, SolarRealtime, UnifiedSample


class EnergyCalculator:
    @staticmethod
    def merge(meter: SmartMeterRealtime, solar: SolarRealtime) -> UnifiedSample:
        timestamp = max(meter.timestamp, solar.timestamp)
        net_grid = meter.electricity_import_w - meter.electricity_export_w
        net_home = net_grid + solar.production_w
        return UnifiedSample(
            timestamp=timestamp,
            electricityImportW=meter.electricity_import_w,
            electricityExportW=meter.electricity_export_w,
            solarProductionW=solar.production_w,
            gasFlowM3h=meter.gas_flow_m3h,
            gasMeterReadingM3=meter.gas_meter_reading_m3,
            netGridW=net_grid,
            netHomeW=net_home,
        )

    @staticmethod
    def build_insights(now: UnifiedSample, today: DailySummary) -> list[InsightCard]:
        return [
            InsightCard(
                title="You used today",
                value=f"{today.usedKwh:.2f} kWh",
                context="Total household usage",
            ),
            InsightCard(
                title="Solar coverage",
                value=f"{today.solarCoveragePct:.0f}%",
                context="Production versus usage",
            ),
            InsightCard(
                title="Current net grid",
                value=f"{now.netGridW:.0f} W",
                context="Importing from grid" if now.netGridW >= 0 else "Exporting to grid",
            ),
        ]
