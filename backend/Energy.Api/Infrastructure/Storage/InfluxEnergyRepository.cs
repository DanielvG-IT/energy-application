using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Energy.Api.Application;
using Energy.Api.Domain;
using Microsoft.Extensions.Options;

namespace Energy.Api.Infrastructure.Storage;

public sealed class InfluxEnergyRepository(HttpClient httpClient, IOptions<InfluxOptions> options) : IEnergyRepository
{
    private readonly InfluxOptions _cfg = options.Value;

    public async Task WriteSampleAsync(UnifiedSample sample, CancellationToken cancellationToken)
    {
        var body = new StringBuilder();
        body.AppendLine(BuildLine("electricity_import_w", sample.ElectricityImportW, sample.Timestamp));
        body.AppendLine(BuildLine("electricity_export_w", sample.ElectricityExportW, sample.Timestamp));
        body.AppendLine(BuildLine("solar_production_w", sample.SolarProductionW, sample.Timestamp));
        body.AppendLine(BuildLine("gas_flow_m3h", sample.GasFlowM3h, sample.Timestamp));
        body.AppendLine(BuildLine("net_grid_w", sample.NetGridW, sample.Timestamp));
        body.AppendLine(BuildLine("net_home_w", sample.NetHomeW, sample.Timestamp));

        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"{_cfg.Url.TrimEnd('/')}/api/v2/write?org={Uri.EscapeDataString(_cfg.Org)}&bucket={Uri.EscapeDataString(_cfg.Bucket)}&precision=ns");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", _cfg.Token);
        request.Content = new StringContent(body.ToString(), Encoding.UTF8, "text/plain");

        using var response = await httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task<UnifiedSample?> GetLatestAsync(CancellationToken cancellationToken)
    {
        var from = DateTimeOffset.UtcNow.AddMinutes(-30);
        var to = DateTimeOffset.UtcNow;
        var import = await QuerySeriesAsync("electricity_import_w", from, to, "1m", cancellationToken);
        var export = await QuerySeriesAsync("electricity_export_w", from, to, "1m", cancellationToken);
        var solar = await QuerySeriesAsync("solar_production_w", from, to, "1m", cancellationToken);
        var gas = await QuerySeriesAsync("gas_flow_m3h", from, to, "1m", cancellationToken);
        var netGrid = await QuerySeriesAsync("net_grid_w", from, to, "1m", cancellationToken);
        var netHome = await QuerySeriesAsync("net_home_w", from, to, "1m", cancellationToken);

        var latestTime = new[] { import.LastOrDefault(), export.LastOrDefault(), solar.LastOrDefault(), gas.LastOrDefault(), netGrid.LastOrDefault(), netHome.LastOrDefault() }
            .Where(p => p is not null)
            .Select(p => p!.Timestamp)
            .DefaultIfEmpty()
            .Max();

        if (latestTime == default)
        {
            return null;
        }

        return new UnifiedSample(
            latestTime,
            LastValue(import),
            LastValue(export),
            LastValue(solar),
            LastValue(gas),
            LastValue(netGrid),
            LastValue(netHome));
    }

    public Task<IReadOnlyList<AggregatePoint>> GetConsumptionAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken)
        => QuerySeriesAsync("net_home_w", from, to, MapWindow(window), cancellationToken);

    public Task<IReadOnlyList<AggregatePoint>> GetProductionAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken)
        => QuerySeriesAsync("solar_production_w", from, to, MapWindow(window), cancellationToken);

    public Task<IReadOnlyList<AggregatePoint>> GetGasAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken)
        => QuerySeriesAsync("gas_flow_m3h", from, to, MapWindow(window), cancellationToken);

    public async Task<DailySummary> GetTodaySummaryAsync(DateOnly localDate, CancellationToken cancellationToken)
    {
        var from = new DateTimeOffset(localDate.ToDateTime(TimeOnly.MinValue), TimeZoneInfo.Local.GetUtcOffset(DateTime.Now)).ToUniversalTime();
        var to = DateTimeOffset.UtcNow;

        var usageSeries = await QuerySeriesAsync("net_home_w", from, to, "15m", cancellationToken);
        var productionSeries = await QuerySeriesAsync("solar_production_w", from, to, "15m", cancellationToken);
        var importSeries = await QuerySeriesAsync("electricity_import_w", from, to, "15m", cancellationToken);
        var exportSeries = await QuerySeriesAsync("electricity_export_w", from, to, "15m", cancellationToken);
        var gasSeries = await QuerySeriesAsync("gas_flow_m3h", from, to, "15m", cancellationToken);

        var elapsedHours = Math.Clamp((DateTime.Now - localDate.ToDateTime(TimeOnly.MinValue)).TotalHours, 0, 24);

        var usedKwh = usageSeries.Count == 0 ? 0 : usageSeries.Average(x => Math.Max(x.Value, 0)) * elapsedHours / 1000;
        var producedKwh = productionSeries.Count == 0 ? 0 : productionSeries.Average(x => x.Value) * elapsedHours / 1000;
        var importedKwh = importSeries.Count == 0 ? 0 : importSeries.Average(x => x.Value) * elapsedHours / 1000;
        var exportedKwh = exportSeries.Count == 0 ? 0 : exportSeries.Average(x => x.Value) * elapsedHours / 1000;
        var gasM3 = gasSeries.Count == 0 ? 0 : gasSeries.Average(x => x.Value) * elapsedHours;
        var solarUsedKwh = Math.Max(usedKwh - importedKwh, 0);
        var coverage = usedKwh <= 0 ? 0 : Math.Min(100, (solarUsedKwh / usedKwh) * 100);

        return new DailySummary(localDate, usedKwh, producedKwh, importedKwh, exportedKwh, gasM3, coverage);
    }

    private async Task<IReadOnlyList<AggregatePoint>> QuerySeriesAsync(string metric, DateTimeOffset from, DateTimeOffset to, string every, CancellationToken cancellationToken)
    {
        var flux =
            "from(bucket: \"" + _cfg.Bucket + "\")" +
            " |> range(start: " + from.ToString("O") + ", stop: " + to.ToString("O") + ")" +
            " |> filter(fn: (r) => r._measurement == \"energy\" and r.metric == \"" + metric + "\")" +
            " |> aggregateWindow(every: " + every + ", fn: mean, createEmpty: false)" +
            " |> keep(columns: [\"_time\", \"_value\"])";

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_cfg.Url.TrimEnd('/')}/api/v2/query?org={Uri.EscapeDataString(_cfg.Org)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", _cfg.Token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/csv"));
        request.Content = new StringContent(JsonSerializer.Serialize(new { query = flux }), Encoding.UTF8, "application/json");

        using var response = await httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var csv = await response.Content.ReadAsStringAsync(cancellationToken);
        return ParseInfluxCsv(csv);
    }

    private static List<AggregatePoint> ParseInfluxCsv(string csv)
    {
        var rows = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var list = new List<AggregatePoint>();

        foreach (var row in rows)
        {
            if (row.StartsWith("#", StringComparison.Ordinal) || row.Contains(",result,table,"))
            {
                continue;
            }

            var parts = row.Split(',');
            if (parts.Length < 2)
            {
                continue;
            }

            var timeRaw = parts[^2].Trim();
            var valueRaw = parts[^1].Trim();
            if (DateTimeOffset.TryParse(timeRaw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var t) &&
                double.TryParse(valueRaw, CultureInfo.InvariantCulture, out var v))
            {
                list.Add(new AggregatePoint(t, v));
            }
        }

        return list;
    }

    private static string BuildLine(string metric, double value, DateTimeOffset timestamp)
    {
        var ns = timestamp.ToUnixTimeMilliseconds() * 1_000_000;
        return $"energy,metric={metric} value={value.ToString(CultureInfo.InvariantCulture)} {ns}";
    }

    private static double LastValue(IReadOnlyList<AggregatePoint> points)
        => points.Count == 0 ? 0 : points[^1].Value;

    private static string MapWindow(string window) => window.ToLowerInvariant() switch
    {
        "hour" => "5m",
        "month" => "1d",
        _ => "1h"
    };
}
