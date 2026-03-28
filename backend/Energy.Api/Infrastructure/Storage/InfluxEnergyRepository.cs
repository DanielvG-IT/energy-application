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
    private const string ElectricityImportMetric = "electricity_import_w";
    private const string ElectricityExportMetric = "electricity_export_w";
    private const string SolarProductionMetric = "solar_production_w";
    private const string GasFlowMetric = "gas_flow_m3h";
    private const string GasMeterMetric = "gas_meter_m3";
    private const string NetGridMetric = "net_grid_w";
    private const string NetHomeMetric = "net_home_w";
    private const double LegacyGasThresholdM3h = 50;

    private readonly InfluxOptions _cfg = options.Value;

    public async Task WriteSampleAsync(UnifiedSample sample, CancellationToken cancellationToken)
    {
        var body = new StringBuilder();
        body.AppendLine(BuildLine(ElectricityImportMetric, sample.ElectricityImportW, sample.Timestamp));
        body.AppendLine(BuildLine(ElectricityExportMetric, sample.ElectricityExportW, sample.Timestamp));
        body.AppendLine(BuildLine(SolarProductionMetric, sample.SolarProductionW, sample.Timestamp));
        body.AppendLine(BuildLine(GasFlowMetric, sample.GasFlowM3h, sample.Timestamp));
        body.AppendLine(BuildLine(GasMeterMetric, sample.GasMeterReadingM3, sample.Timestamp));
        body.AppendLine(BuildLine(NetGridMetric, sample.NetGridW, sample.Timestamp));
        body.AppendLine(BuildLine(NetHomeMetric, sample.NetHomeW, sample.Timestamp));

        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"{_cfg.Url.TrimEnd('/')}/api/v2/write?org={Uri.EscapeDataString(_cfg.Org)}&bucket={Uri.EscapeDataString(_cfg.Bucket)}&precision=ns");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", _cfg.Token);
        request.Content = new StringContent(body.ToString(), Encoding.UTF8, "text/plain");

        using var response = await httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task PingAsync(CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{_cfg.Url.TrimEnd('/')}/api/v2/buckets?name={Uri.EscapeDataString(_cfg.Bucket)}&org={Uri.EscapeDataString(_cfg.Org)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", _cfg.Token);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task<UnifiedSample?> GetLatestAsync(CancellationToken cancellationToken)
    {
        var from = DateTimeOffset.UtcNow.AddMinutes(-30);
        var to = DateTimeOffset.UtcNow;
        var import = await QuerySeriesAsync(ElectricityImportMetric, from, to, "1m", cancellationToken);
        var export = await QuerySeriesAsync(ElectricityExportMetric, from, to, "1m", cancellationToken);
        var solar = await QuerySeriesAsync(SolarProductionMetric, from, to, "1m", cancellationToken);
        var gasFlow = await QuerySeriesAsync(GasFlowMetric, from, to, "1m", cancellationToken);
        var gasMeter = await QuerySeriesAsync(GasMeterMetric, from, to, "1m", cancellationToken);
        var netGrid = await QuerySeriesAsync(NetGridMetric, from, to, "1m", cancellationToken);
        var netHome = await QuerySeriesAsync(NetHomeMetric, from, to, "1m", cancellationToken);

        var latestTime = new[] { import.LastOrDefault(), export.LastOrDefault(), solar.LastOrDefault(), gasFlow.LastOrDefault(), gasMeter.LastOrDefault(), netGrid.LastOrDefault(), netHome.LastOrDefault() }
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
            SelectGasFlow(gasFlow, gasMeter),
            LastValue(gasMeter),
            LastValue(netGrid),
            LastValue(netHome));
    }

    public Task<IReadOnlyList<AggregatePoint>> GetConsumptionAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken)
        => QuerySeriesAsync(NetHomeMetric, from, to, MapWindow(window), cancellationToken);

    public Task<IReadOnlyList<AggregatePoint>> GetProductionAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken)
        => QuerySeriesAsync(SolarProductionMetric, from, to, MapWindow(window), cancellationToken);

    public async Task<IReadOnlyList<AggregatePoint>> GetGasAsync(DateTimeOffset from, DateTimeOffset to, string window, CancellationToken cancellationToken)
    {
        var every = MapWindow(window);
        var gasFlow = await QuerySeriesAsync(GasFlowMetric, from, to, every, cancellationToken);
        var gasMeter = await QuerySeriesAsync(GasMeterMetric, from, to, every, cancellationToken);

        if (gasMeter.Count > 1)
        {
            return DeriveFlowSeriesFromMeterReadings(gasMeter);
        }

        if (LooksLikeLegacyGasMeterSeries(gasFlow))
        {
            return DeriveFlowSeriesFromMeterReadings(gasFlow);
        }

        return gasFlow;
    }

    public async Task<DailySummary> GetTodaySummaryAsync(DateOnly localDate, CancellationToken cancellationToken)
    {
        var from = new DateTimeOffset(localDate.ToDateTime(TimeOnly.MinValue), TimeZoneInfo.Local.GetUtcOffset(DateTime.Now)).ToUniversalTime();
        var to = DateTimeOffset.UtcNow;

        var usageSeries = await QuerySeriesAsync(NetHomeMetric, from, to, "15m", cancellationToken);
        var productionSeries = await QuerySeriesAsync(SolarProductionMetric, from, to, "15m", cancellationToken);
        var importSeries = await QuerySeriesAsync(ElectricityImportMetric, from, to, "15m", cancellationToken);
        var exportSeries = await QuerySeriesAsync(ElectricityExportMetric, from, to, "15m", cancellationToken);
        var gasMeterSeries = await QuerySeriesAsync(GasMeterMetric, from, to, "15m", cancellationToken);
        var legacyGasSeries = gasMeterSeries.Count == 0
            ? await QuerySeriesAsync(GasFlowMetric, from, to, "15m", cancellationToken)
            : [];

        var elapsedHours = Math.Clamp((DateTime.Now - localDate.ToDateTime(TimeOnly.MinValue)).TotalHours, 0, 24);

        var usedKwh = usageSeries.Count == 0 ? 0 : usageSeries.Average(x => Math.Max(x.Value, 0)) * elapsedHours / 1000;
        var producedKwh = productionSeries.Count == 0 ? 0 : productionSeries.Average(x => x.Value) * elapsedHours / 1000;
        var importedKwh = importSeries.Count == 0 ? 0 : importSeries.Average(x => x.Value) * elapsedHours / 1000;
        var exportedKwh = exportSeries.Count == 0 ? 0 : exportSeries.Average(x => x.Value) * elapsedHours / 1000;
        var gasM3 = ComputeGasConsumedToday(gasMeterSeries, legacyGasSeries);
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

    private static double SelectGasFlow(IReadOnlyList<AggregatePoint> gasFlow, IReadOnlyList<AggregatePoint> gasMeter)
    {
        var latestFlow = LastValue(gasFlow);
        if (latestFlow > 0 && latestFlow < LegacyGasThresholdM3h)
        {
            return latestFlow;
        }

        if (gasMeter.Count > 1)
        {
            return LastValue(DeriveFlowSeriesFromMeterReadings(gasMeter));
        }

        if (LooksLikeLegacyGasMeterSeries(gasFlow))
        {
            return LastValue(DeriveFlowSeriesFromMeterReadings(gasFlow));
        }

        return Math.Clamp(latestFlow, 0, LegacyGasThresholdM3h);
    }

    private static double ComputeGasConsumedToday(IReadOnlyList<AggregatePoint> gasMeterSeries, IReadOnlyList<AggregatePoint> legacyGasSeries)
    {
        if (gasMeterSeries.Count > 1)
        {
            return ComputeMeterDelta(gasMeterSeries);
        }

        if (LooksLikeLegacyGasMeterSeries(legacyGasSeries))
        {
            return ComputeMeterDelta(legacyGasSeries);
        }

        return 0;
    }

    private static double ComputeMeterDelta(IReadOnlyList<AggregatePoint> points)
    {
        if (points.Count < 2)
        {
            return 0;
        }

        var delta = points[^1].Value - points[0].Value;
        return delta > 0 ? delta : 0;
    }

    private static bool LooksLikeLegacyGasMeterSeries(IReadOnlyList<AggregatePoint> points)
    {
        return points.Count > 1 && points.Max(p => p.Value) > LegacyGasThresholdM3h;
    }

    private static IReadOnlyList<AggregatePoint> DeriveFlowSeriesFromMeterReadings(IReadOnlyList<AggregatePoint> meterSeries)
    {
        var flowSeries = new List<AggregatePoint>();

        for (var i = 1; i < meterSeries.Count; i++)
        {
            var previous = meterSeries[i - 1];
            var current = meterSeries[i];
            var elapsedHours = (current.Timestamp - previous.Timestamp).TotalHours;
            var deltaM3 = current.Value - previous.Value;

            if (elapsedHours <= 0 || deltaM3 < 0)
            {
                continue;
            }

            var flowM3h = deltaM3 / elapsedHours;
            flowSeries.Add(new AggregatePoint(current.Timestamp, Math.Clamp(flowM3h, 0, LegacyGasThresholdM3h)));
        }

        return flowSeries;
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
