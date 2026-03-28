using Energy.Api.Domain;

namespace Energy.Api.Application;

public interface IEnergyCalculator
{
    UnifiedSample Merge(SmartMeterRealtime meter, SolarRealtime solar);
    IReadOnlyList<InsightCard> BuildInsights(UnifiedSample now, DailySummary today);
}

public sealed class EnergyCalculator : IEnergyCalculator
{
    public UnifiedSample Merge(SmartMeterRealtime meter, SolarRealtime solar)
    {
        var timestamp = meter.Timestamp > solar.Timestamp ? meter.Timestamp : solar.Timestamp;
        var netGrid = meter.ElectricityImportW - meter.ElectricityExportW;
        var netHome = netGrid + solar.ProductionW;

        return new UnifiedSample(
            timestamp,
            meter.ElectricityImportW,
            meter.ElectricityExportW,
            solar.ProductionW,
            meter.GasFlowM3h,
            netGrid,
            netHome);
    }

    public IReadOnlyList<InsightCard> BuildInsights(UnifiedSample now, DailySummary today)
    {
        return
        [
            new InsightCard("You used today", $"{today.UsedKwh:F2} kWh", "Total household usage"),
            new InsightCard("Solar coverage", $"{today.SolarCoveragePct:F0}%", "Production versus usage"),
            new InsightCard("Current net grid", $"{now.NetGridW:F0} W", now.NetGridW >= 0 ? "Importing from grid" : "Exporting to grid")
        ];
    }
}
