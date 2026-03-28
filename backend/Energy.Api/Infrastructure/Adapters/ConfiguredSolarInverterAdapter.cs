using Energy.Api.Application;
using Energy.Api.Domain;
using Energy.Api.Infrastructure.Configuration;

namespace Energy.Api.Infrastructure.Adapters;

public sealed class ConfiguredSolarInverterAdapter(
    IRuntimeEnergySettings settings,
    SmaInverterAdapter sma,
    EnphaseInverterAdapter enphase,
    ILogger<ConfiguredSolarInverterAdapter> logger) : ISolarInverterAdapter
{
  public async Task<SolarRealtime> GetRealtimeAsync(CancellationToken cancellationToken)
  {
    var cfg = settings.Get();

    var tasks = new List<Task<(string Source, double Value, Exception? Error)>>();
    if (!string.IsNullOrWhiteSpace(cfg.SmaInverterBaseUrl))
    {
      tasks.Add(ReadSourceAsync("SMA", () => sma.GetRealtimeAsync(cancellationToken), cancellationToken));
    }

    if (!string.IsNullOrWhiteSpace(cfg.EnphaseInverterBaseUrl))
    {
      tasks.Add(ReadSourceAsync("Enphase", () => enphase.GetRealtimeAsync(cancellationToken), cancellationToken));
    }

    if (tasks.Count == 0)
    {
      throw new ConfigFailureException(nameof(ConfiguredSolarInverterAdapter), "At least one solar source must be configured.");
    }

    var results = await Task.WhenAll(tasks);
    var successes = results.Where(r => r.Error is null).ToArray();

    if (successes.Length == 0)
    {
      foreach (var failure in results.Where(r => r.Error is not null))
      {
        logger.LogWarning(failure.Error, "{Source} inverter read failed.", failure.Source);
      }

      var failures = results.Where(r => r.Error is not null).Select(r => r.Error!).ToArray();
      throw BuildAggregateFailure(failures);
    }

    foreach (var failure in results.Where(r => r.Error is not null))
    {
      logger.LogDebug(failure.Error, "{Source} inverter read failed, but another configured solar source succeeded.", failure.Source);
    }

    var totalW = successes.Sum(r => r.Value);
    return new SolarRealtime(DateTimeOffset.UtcNow, totalW);
  }

  private static AdapterFailureException BuildAggregateFailure(IReadOnlyList<Exception> failures)
  {
    if (failures.OfType<AuthFailureException>().Any())
    {
      var first = failures.OfType<AuthFailureException>().First();
      return new AuthFailureException(nameof(ConfiguredSolarInverterAdapter), "All configured solar sources failed; at least one authentication failure occurred.", first);
    }

    if (failures.OfType<TransientFailureException>().Any())
    {
      var first = failures.OfType<TransientFailureException>().First();
      return new TransientFailureException(nameof(ConfiguredSolarInverterAdapter), "All configured solar sources failed due to transient errors.", first);
    }

    var configFailure = failures.OfType<ConfigFailureException>().FirstOrDefault();
    if (configFailure is not null)
    {
      return new ConfigFailureException(nameof(ConfiguredSolarInverterAdapter), "All configured solar sources failed due to configuration errors.", configFailure);
    }

    return new TransientFailureException(nameof(ConfiguredSolarInverterAdapter), "All configured solar sources failed with unexpected errors.", failures.FirstOrDefault());
  }

  private static async Task<(string Source, double Value, Exception? Error)> ReadSourceAsync(
    string source,
    Func<Task<SolarRealtime>> read,
    CancellationToken cancellationToken)
  {
    try
    {
      var sample = await read();
      return (source, sample.ProductionW, null);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
      throw;
    }
    catch (Exception ex)
    {
      return (source, 0, ex);
    }
  }
}
