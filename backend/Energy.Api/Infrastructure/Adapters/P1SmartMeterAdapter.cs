using Energy.Api.Application;
using Energy.Api.Domain;
using Energy.Api.Infrastructure.Configuration;

namespace Energy.Api.Infrastructure.Adapters;

/// <summary>
/// ESPHome-based P1 smart meter adapter for Slimmelezer devices.
/// Queries individual DSMR sensors via ESPHome REST API.
/// </summary>
public sealed class P1SmartMeterAdapter(HttpClient httpClient, IRuntimeEnergySettings settings, ILogger<P1SmartMeterAdapter> logger) : ISmartMeterAdapter
{
  public async Task<SmartMeterRealtime> GetRealtimeAsync(CancellationToken cancellationToken)
  {
    var cfg = settings.Get();
    if (string.IsNullOrWhiteSpace(cfg.SmartMeterBaseUrl))
    {
      throw new ConfigFailureException(nameof(P1SmartMeterAdapter), "SmartMeterBaseUrl is required.");
    }

    var baseUrl = cfg.SmartMeterBaseUrl.TrimEnd('/');
    var (powerConsumedW, powerProducedW, gasM3) = await FetchSensorValuesAsync(baseUrl, cancellationToken);

    return new SmartMeterRealtime(
        DateTimeOffset.UtcNow,
        // Keep import/export as raw grid channels; net is derived later in EnergyCalculator.
        powerConsumedW,
        powerProducedW,
        gasM3);
  }

  private async Task<(double powerConsumedW, double powerProducedW, double gasM3)> FetchSensorValuesAsync(
      string baseUrl, CancellationToken cancellationToken)
  {
    // Query ESPHome REST API for individual sensor values in parallel
    // Sensor names are derived from DSMR component entity names (uppercase/spaces → lowercase/underscores)
    var powerConsumedTask = QuerySensorAsync($"{baseUrl}/sensor/power_consumed", "power_consumed", cancellationToken);
    var powerProducedTask = QuerySensorAsync($"{baseUrl}/sensor/power_produced", "power_produced", cancellationToken);
    var gasTask = QuerySensorAsync($"{baseUrl}/sensor/gas_consumed", "gas_consumed", cancellationToken);

    try
    {
      await Task.WhenAll(powerConsumedTask, powerProducedTask, gasTask);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "Failed to fetch P1 sensor values from ESPHome.");
      throw;
    }

    return (
        powerConsumedTask.Result,
        powerProducedTask.Result,
        gasTask.Result);
  }

  private async Task<double> QuerySensorAsync(string endpoint, string sensorName, CancellationToken cancellationToken)
  {
    HttpResponseMessage response;
    try
    {
      response = await httpClient.GetAsync(endpoint, cancellationToken);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
      throw;
    }
    catch (HttpRequestException ex)
    {
      throw new TransientFailureException(nameof(P1SmartMeterAdapter), $"Failed to query P1 sensor '{sensorName}'.", ex);
    }

    if (response.IsSuccessStatusCode)
    {
      var payload = await response.Content.ReadFromJsonAsync<EsphomeSensorPayload>(cancellationToken);
      if (payload?.Value.HasValue == true)
      {
        logger.LogDebug("Successfully queried {SensorName}: {Value}", sensorName, payload.Value);
        return payload.Value.Value;
      }
    }

    if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
    {
      logger.LogWarning("P1 sensor '{SensorName}' not found at {Endpoint}. Check ESPHome entity names.", sensorName, endpoint);
      return 0.0;
    }

    if ((int)response.StatusCode is 401 or 403)
    {
      throw new AuthFailureException(nameof(P1SmartMeterAdapter), $"P1 sensor '{sensorName}' returned unauthorized status {response.StatusCode}.");
    }

    if ((int)response.StatusCode >= 500)
    {
      throw new TransientFailureException(nameof(P1SmartMeterAdapter), $"P1 sensor '{sensorName}' returned transient status {response.StatusCode}.");
    }

    throw new ConfigFailureException(nameof(P1SmartMeterAdapter), $"Failed to query P1 sensor '{sensorName}': {response.StatusCode}.");
  }

  private sealed record EsphomeSensorPayload(
      [property: System.Text.Json.Serialization.JsonPropertyName("id")] string? Id,
      [property: System.Text.Json.Serialization.JsonPropertyName("state")] string? State,
      [property: System.Text.Json.Serialization.JsonPropertyName("value")] double? Value);
}
