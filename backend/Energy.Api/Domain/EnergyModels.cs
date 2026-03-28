namespace Energy.Api.Domain;

public sealed record SmartMeterRealtime(
    DateTimeOffset Timestamp,
    double ElectricityImportW,
    double ElectricityExportW,
    double GasFlowM3h,
    double GasMeterReadingM3);

public sealed record SolarRealtime(
    DateTimeOffset Timestamp,
    double ProductionW);

public sealed record UnifiedSample(
    DateTimeOffset Timestamp,
    double ElectricityImportW,
    double ElectricityExportW,
    double SolarProductionW,
    double GasFlowM3h,
    double GasMeterReadingM3,
    double NetGridW,
    double NetHomeW);

public sealed record DailySummary(
    DateOnly Date,
    double UsedKwh,
    double ProducedKwh,
    double ImportedKwh,
    double ExportedKwh,
    double GasM3,
    double SolarCoveragePct);

public sealed record InsightCard(string Title, string Value, string Context);

public sealed record AggregatePoint(DateTimeOffset Timestamp, double Value);

public sealed record HistoryResponse(
    string Window,
    IReadOnlyList<AggregatePoint> Consumption,
    IReadOnlyList<AggregatePoint> Production,
    IReadOnlyList<AggregatePoint> Gas);
