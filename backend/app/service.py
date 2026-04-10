from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from .calculator import EnergyCalculator
from .models import HistoryResponse, InsightCard, UnifiedSample
from .storage.influx_repository import InfluxEnergyRepository


class EnergyService:
    def __init__(self, repository: InfluxEnergyRepository, calculator: EnergyCalculator) -> None:
        self._repository = repository
        self._calculator = calculator

    async def get_now(self) -> UnifiedSample | None:
        return await self._repository.get_latest()

    async def get_today(self) -> tuple[object, list[InsightCard]]:
        now = await self._repository.get_latest()
        summary = await self._repository.get_today_summary(date.today())
        insights = [] if now is None else self._calculator.build_insights(now, summary)
        return summary, insights

    async def get_history(self, start: datetime | None, end: datetime | None, window: str | None) -> HistoryResponse:
        range_end = end or datetime.now(timezone.utc)
        range_start = start or (range_end - timedelta(days=7))
        selected_window = window if window and window.strip() else "day"

        consumption = await self._repository.get_consumption(range_start, range_end, selected_window)
        production = await self._repository.get_production(range_start, range_end, selected_window)
        gas = await self._repository.get_gas(range_start, range_end, selected_window)

        return HistoryResponse(
            window=selected_window,
            consumption=consumption,
            production=production,
            gas=gas,
        )
