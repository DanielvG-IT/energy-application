using Energy.Api.Domain;

namespace Energy.Api.Application;

public interface ISmartMeterAdapter
{
    Task<SmartMeterRealtime> GetRealtimeAsync(CancellationToken cancellationToken);
}

public interface ISolarInverterAdapter
{
    Task<SolarRealtime> GetRealtimeAsync(CancellationToken cancellationToken);
}

public interface IEnergyRepository
{
    Task WriteSampleAsync(UnifiedSample sample, CancellationToken cancellationToken);
    Task PingAsync(CancellationToken cancellationToken);
    Task<UnifiedSample?> GetLatestAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<AggregatePoint>> GetConsumptionAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken);
    Task<IReadOnlyList<AggregatePoint>> GetProductionAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken);
    Task<IReadOnlyList<AggregatePoint>> GetGasAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken);
    Task<DailySummary> GetTodaySummaryAsync(DateOnly localDate, CancellationToken cancellationToken);
}
