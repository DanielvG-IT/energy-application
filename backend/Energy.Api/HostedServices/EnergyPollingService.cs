using Energy.Api.Application;
using Energy.Api.Infrastructure.Adapters;
using Energy.Api.Infrastructure.Configuration;
using Energy.Api.Domain;

namespace Energy.Api.HostedServices;

public sealed class EnergyPollingService(
    ISmartMeterAdapter smartMeterAdapter,
    ISolarInverterAdapter solarAdapter,
    IEnergyCalculator calculator,
    IEnergyRepository repository,
    IRuntimeEnergySettings runtimeSettings,
    ILogger<EnergyPollingService> logger) : BackgroundService
{
  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    var smartMeterConfigMissingLogged = false;
    var solarConfigMissingLogged = false;

    while (!stoppingToken.IsCancellationRequested)
    {
      var cfg = runtimeSettings.Get();
      var interval = TimeSpan.FromSeconds(Math.Clamp(cfg.PollingSeconds, 5, 30));

      if (string.IsNullOrWhiteSpace(cfg.SmartMeterBaseUrl))
      {
        if (!smartMeterConfigMissingLogged)
        {
          logger.LogInformation("Skipping polling until Smart Meter Base URL is configured via /api/settings.");
          smartMeterConfigMissingLogged = true;
        }

        await Task.Delay(interval, stoppingToken);
        continue;
      }

      smartMeterConfigMissingLogged = false;

      try
      {
        var meter = await smartMeterAdapter.GetRealtimeAsync(stoppingToken);
        SolarRealtime solar;

        if (string.IsNullOrWhiteSpace(cfg.SmaInverterBaseUrl) && string.IsNullOrWhiteSpace(cfg.EnphaseInverterBaseUrl))
        {
          if (!solarConfigMissingLogged)
          {
            logger.LogInformation("No solar inverter base URL configured yet; using 0W fallback until configured via /api/settings.");
            solarConfigMissingLogged = true;
          }

          solar = new SolarRealtime(DateTimeOffset.UtcNow, 0);
        }
        else
        {
          solarConfigMissingLogged = false;

          try
          {
            solar = await solarAdapter.GetRealtimeAsync(stoppingToken);
          }
          catch (AdapterFailureException ex) when (ex.Kind == AdapterFailureKind.Auth)
          {
            logger.LogWarning(ex, "Solar adapter authentication failed; using 0W fallback.");
            solar = new SolarRealtime(DateTimeOffset.UtcNow, 0);
          }
          catch (AdapterFailureException ex) when (ex.Kind == AdapterFailureKind.Config)
          {
            logger.LogWarning(ex, "Solar adapter configuration invalid; using 0W fallback.");
            solar = new SolarRealtime(DateTimeOffset.UtcNow, 0);
          }
          catch (AdapterFailureException ex) when (ex.Kind == AdapterFailureKind.Transient)
          {
            logger.LogWarning(ex, "Solar adapter transient failure; using 0W fallback.");
            solar = new SolarRealtime(DateTimeOffset.UtcNow, 0);
          }
          catch (Exception ex)
          {
            logger.LogWarning(ex, "Solar adapter failed for this cycle; using 0W fallback.");
            solar = new SolarRealtime(DateTimeOffset.UtcNow, 0);
          }
        }

        var merged = calculator.Merge(meter, solar);
        await repository.WriteSampleAsync(merged, stoppingToken);
      }
      catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
      {
        break;
      }
      catch (AdapterFailureException ex) when (ex.Kind == AdapterFailureKind.Config)
      {
        logger.LogWarning(ex, "Polling cycle configuration failure in {Adapter}.", ex.Adapter);
      }
      catch (AdapterFailureException ex) when (ex.Kind == AdapterFailureKind.Auth)
      {
        logger.LogWarning(ex, "Polling cycle authentication failure in {Adapter}.", ex.Adapter);
      }
      catch (AdapterFailureException ex) when (ex.Kind == AdapterFailureKind.Transient)
      {
        logger.LogWarning(ex, "Polling cycle transient failure in {Adapter}.", ex.Adapter);
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "Polling cycle failed.");
      }

      await Task.Delay(interval, stoppingToken);
    }
  }
}
