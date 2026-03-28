using Energy.Api.Domain;

namespace Energy.Api.Application;

public interface IEnergyService
{
    Task<UnifiedSample?> GetNowAsync(CancellationToken cancellationToken);
    Task<(DailySummary Summary, IReadOnlyList<InsightCard> Insights)> GetTodayAsync(CancellationToken cancellationToken);
    Task<HistoryResponse> GetHistoryAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken);
}

public sealed class EnergyService(IEnergyRepository repository, IEnergyCalculator calculator) : IEnergyService
{
    public Task<UnifiedSample?> GetNowAsync(CancellationToken cancellationToken) =>
        repository.GetLatestAsync(cancellationToken);

    public async Task<(DailySummary Summary, IReadOnlyList<InsightCard> Insights)> GetTodayAsync(CancellationToken cancellationToken)
    {
        var now = await repository.GetLatestAsync(cancellationToken);
        var summary = await repository.GetTodaySummaryAsync(DateOnly.FromDateTime(DateTime.Now), cancellationToken);
        var insights = now is null
            ? new List<InsightCard>()
            : calculator.BuildInsights(now, summary);

        return (summary, insights);
    }

    public async Task<HistoryResponse> GetHistoryAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken)
    {
        var consumption = await repository.GetConsumptionAsync(from, to, window, cancellationToken);
        var production = await repository.GetProductionAsync(from, to, window, cancellationToken);
        var gas = await repository.GetGasAsync(from, to, window, cancellationToken);

        return new HistoryResponse(window, consumption, production, gas);
    }
}
